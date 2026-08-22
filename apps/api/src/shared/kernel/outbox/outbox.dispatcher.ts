import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { SpanStatusCode, trace } from "@opentelemetry/api"
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm"

import { env } from "../../config/env"
import { DedicatedClientFactory } from "../../infra/database/dedicated-client.factory"
import { DRIZZLE, type DrizzleDb } from "../../infra/database/drizzle.provider"
import { ManagedDedicatedClient } from "../../infra/database/managed-dedicated-client"
import { buildEventContextStore } from "../context/event-context"
import { RequestContext } from "../context/request-context"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"
import { redactSensitive } from "../redaction/sensitive-keys"
import { MaintenanceJob } from "../scheduling/maintenance-job.decorator"
import { remoteSpanContextFromTraceparent } from "../tracing/event-trace-propagation"
import { TransactionManager } from "../transactional/transaction-manager"

import { outbox, outboxDead, type OutboxRow } from "./outbox.table"

import type { EventEnvelope } from "../events/domain-event.base"
import type { Client } from "pg"

const tracer = trace.getTracer("outbox")

const POLL_INTERVAL_MS = 2000
const BATCH_SIZE = 20
export const MAX_ATTEMPTS = 8
const NOTIFY_CHANNEL = "outbox_new"
// Janela de lease: tempo que uma linha claimada fica reservada antes de outro
// worker poder re-claimá-la. Maior que o handler mais lento esperado.
const LEASE_MS = 60_000
// Retenção: apaga linhas publicadas há mais de N dias (a fila não cresce sem
// limite). Replay continua possível pela CLI (reset ou reinsert do dead).
const RETENTION_DAYS = 30

function backoffMs(attempts: number): number {
  // min(2^attempts s, 1h) + jitter(0..30s)
  const base = Math.min(2 ** attempts * 1000, 3_600_000)
  const jitter = Math.floor(Math.random() * 30_000)
  return base + jitter
}

@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly log: AppLogger
  private running = false
  private stopped = false
  private inflight: Promise<void> | null = null
  private readonly listenClient: ManagedDedicatedClient

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    dedicatedClients: DedicatedClientFactory,
    private readonly emitter: EventEmitter2,
    private readonly ctx: RequestContext,
    private readonly txm: TransactionManager,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("OutboxDispatcher")
    this.listenClient = new ManagedDedicatedClient(
      dedicatedClients,
      "outbox-listen",
      (client) => this.onListenReady(client),
      this.log
    )
  }

  async onModuleInit(): Promise<void> {
    await this.ensureListening()
  }

  async onApplicationShutdown(): Promise<void> {
    // Drain: nenhum novo dispatch inicia (stopped) e o em voo é aguardado antes
    // do pool fechar — elimina a corrida @Interval × pool.end ("pool after end").
    this.stopped = true
    if (this.inflight) {
      await this.inflight
    }
    await this.listenClient.end()
  }

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    // O poll é a rede do LISTEN: cobre tanto o NOTIFY perdido quanto a
    // reconexão do canal (ensure() é no-op se o client já está de pé).
    await this.ensureListening()
    await this.dispatchPending()
  }

  @MaintenanceJob("outbox.purge")
  async purgePublished(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
    const deleted = await this.txm
      .getExecutor()
      .delete(outbox)
      .where(and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, cutoff)))
      .returning({ eventId: outbox.eventId })
    this.log.info("outbox.purge", { removed: deleted.length })
  }

  @MaintenanceJob("outbox-dead.purge")
  async purgeDeadLetters(): Promise<void> {
    const cutoff = new Date(
      Date.now() - env().OUTBOX_DEAD_RETENTION_DAYS * 86_400_000
    )
    const deleted = await this.txm
      .getExecutor()
      .delete(outboxDead)
      .where(lt(outboxDead.deadLetteredAt, cutoff))
      .returning({ eventId: outboxDead.eventId })
    this.log.info("outbox-dead.purge", { removed: deleted.length })
  }

  // Conexão dedicada pode cair (restart do Postgres, blip de rede): o
  // ManagedDedicatedClient descarta sozinho e o próximo ensure() (chamado a
  // cada poll) recria o client e reexecuta este onReady — sem timer próprio.
  private async ensureListening(): Promise<void> {
    try {
      await this.listenClient.ensure()
    } catch (err) {
      this.log.warn("outbox.listen_unavailable", { err })
    }
  }

  private async onListenReady(client: Client): Promise<void> {
    await client.query(`LISTEN ${NOTIFY_CHANNEL}`)
    client.on("notification", () => {
      void this.dispatchPending()
    })
  }

  // Claim+lease é transacional e curto; handlers e markPublished rodam FORA de
  // tx. At-least-once = lease (nextAttemptAt) + markIfNew do consumer. Envolver
  // tudo numa tx única reteria o lock FOR UPDATE durante o IO de handler (R17)
  // — proibido. Crash entre claim e emit → lease expira → re-claim → markIfNew
  // dedupe.
  private async dispatchPending(): Promise<void> {
    if (this.running || this.stopped) {
      return
    }
    this.running = true
    this.inflight = this.runBatch()
    try {
      await this.inflight
    } finally {
      this.inflight = null
      this.running = false
    }
  }

  private async runBatch(): Promise<void> {
    try {
      // Fase 1 (curta, transacional): claima o batch sob FOR UPDATE SKIP LOCKED
      // e marca a lease no mesmo statement; commita em milissegundos.
      const rows = await this.db.transaction(async (tx) => {
        const claimed = await tx
          .select()
          .from(outbox)
          .where(
            and(
              isNull(outbox.publishedAt),
              // now() do PG, não Date do JS: Date trunca pra ms e uma linha
              // inserida no mesmo ms (default now() com µs) ficaria invisível
              // pro claim — o insert commitou antes, logo now() daqui é maior.
              lte(outbox.nextAttemptAt, sql`now()`)
            )
          )
          // FIFO-local: ordena por aggregate dentro do batch (occurred_at dentro
          // de cada aggregate). Não é ordering global — entre workers/batches a
          // ordem é best-effort (docs/arch/back.md § Communication and asynchronous
          // work promete só FIFO por aggregate).
          .orderBy(asc(outbox.aggregateId), asc(outbox.occurredAt))
          .limit(BATCH_SIZE)
          .for("update", { skipLocked: true })

        if (claimed.length > 0) {
          await tx
            .update(outbox)
            .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
            .where(
              inArray(
                outbox.eventId,
                claimed.map((r) => r.eventId)
              )
            )
        }
        return claimed
      })

      // Fase 2 (fora de tx): emite os handlers e marca published por linha.
      for (const row of rows) {
        try {
          await this.processClaimed(row)
        } catch (err) {
          this.log.error("outbox.row_failed", { eventId: row.eventId, err })
        }
      }
    } catch (err) {
      this.log.error("outbox.dispatch_batch_failed", { err })
    }
  }

  private async processClaimed(row: OutboxRow): Promise<void> {
    const envelope = row.payload as EventEnvelope
    const listenerCount = this.emitter.listeners(envelope.eventName).length
    if (listenerCount === 0) {
      // Sem handler registrado: NÃO marca published (perderia o evento).
      // Trata como falha transitória — reentra a cada poll até um handler
      // existir ou até MAX_ATTEMPTS (dead-letter sinaliza consumidor ausente).
      this.log.warn("outbox.no_listeners", {
        eventId: row.eventId,
        eventName: row.eventName,
      })
      await this.handleFailure(
        row,
        new Error(`sem listener registrado para ${envelope.eventName}`)
      )
      return
    }
    try {
      await this.emitWithinTrace(envelope)
      // Publicada, a linha vira arquivo: nenhum segredo do envelope pode
      // sobreviver nela. Sem match, `payload` fica fora do SET — a linha
      // intocada não é reescrita.
      const redacted = redactSensitive(row.payload)
      await this.db
        .update(outbox)
        .set({
          publishedAt: new Date(),
          ...(redacted.changed && { payload: redacted.value }),
        })
        .where(eq(outbox.eventId, row.eventId))
      this.log.info("outbox.dispatched", {
        eventId: row.eventId,
        eventName: row.eventName,
        attempts: row.attempts,
        listenerCount,
      })
    } catch (err) {
      await this.handleFailure(row, err)
    }
  }

  /**
   * Roda os handlers num span de trace NOVO com link ao parent (lido do
   * traceparent do envelope). Cross-process = link, não child — evita span
   * tree gigante e preserva o encadeamento produtor↔consumidor.
   */
  private async emitWithinTrace(envelope: EventEnvelope): Promise<void> {
    const parent = remoteSpanContextFromTraceparent(envelope.traceparent)
    await tracer.startActiveSpan(
      `outbox.handle ${envelope.eventName}`,
      { links: parent ? [{ context: parent }] : [] },
      async (span) => {
        try {
          await this.ctx.run(buildEventContextStore(envelope), () =>
            this.emitter.emitAsync(envelope.eventName, envelope)
          )
        } catch (err) {
          span.recordException(err as Error)
          span.setStatus({ code: SpanStatusCode.ERROR })
          throw err
        } finally {
          span.end()
        }
      }
    )
  }

  private async handleFailure(row: OutboxRow, err: unknown): Promise<void> {
    const attempts = row.attempts + 1
    const lastError = err instanceof Error ? err.message : String(err)

    if (attempts >= MAX_ATTEMPTS) {
      // onConflictDoNothing: replay/corrida não viola a PK; o dead row original
      // (lastError/attempts da 1ª falha) é a verdade e não é sobrescrito.
      await this.db
        .insert(outboxDead)
        .values({
          eventId: row.eventId,
          eventName: row.eventName,
          eventVersion: row.eventVersion,
          aggregateId: row.aggregateId,
          aggregateType: row.aggregateType,
          // Dead letter é o arquivo mais longevo da fila: o envelope inteiro é
          // varrido (o payload de domínio aninha em payload.payload).
          payload: redactSensitive(row.payload).value,
          correlationId: row.correlationId,
          causationId: row.causationId,
          tenantId: row.tenantId,
          traceparent: row.traceparent,
          occurredAt: row.occurredAt,
          attempts,
          lastError,
        })
        .onConflictDoNothing()
      await this.db.delete(outbox).where(eq(outbox.eventId, row.eventId))
      this.log.error("outbox.dead_lettered", {
        eventId: row.eventId,
        attempts,
        err,
      })
      return
    }

    await this.db
      .update(outbox)
      .set({
        attempts,
        lastError,
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      })
      .where(eq(outbox.eventId, row.eventId))
    this.log.warn("outbox.dispatch_failed", {
      eventId: row.eventId,
      attempts,
      err,
    })
  }
}

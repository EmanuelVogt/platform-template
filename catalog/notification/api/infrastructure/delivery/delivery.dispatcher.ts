import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm"

import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"
import { redactSensitive } from "../../../../shared/kernel/redaction/sensitive-keys"
import { MaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-job.decorator"
import { registerMaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-registry"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { EMAIL_CHANNEL } from "../../domain/ports/channel.port"
import {
  NOTIFICATIONS_CONFIG,
  type NotificationConfig,
} from "../../notification.config"
import {
  type DeliveryRow,
  notificationDeliveries,
} from "../tables/notification-delivery.table"

import type { ChannelPort } from "../../domain/ports/channel.port"

// Antes do decorator, que resolve a spec no registry ao avaliar a classe.
registerMaintenanceJob({
  name: "delivery.purge",
  cron: "30 3 * * *",
  lockId: 3,
})

const POLL_INTERVAL_MS = 1000
const BATCH_SIZE = 10
// Lease: reserva da linha claimada antes de outro tick/instância poder
// re-claimá-la. Maior que o envio mais lento esperado.
const LEASE_MS = 60_000
const RETENTION_DAYS = 30
const LAST_ERROR_MAX_LENGTH = 500

export function backoffMs(attempts: number): number {
  // min(2^attempts s, 5min) + jitter(0..30s) — formato do kernel, cap menor:
  // 8 tentativas ≈ 8,5min cumulativos ≪ TTL de 1h do token de reset.
  const base = Math.min(2 ** attempts * 1000, 300_000)
  const jitter = Math.floor(Math.random() * 30_000)
  return base + jitter
}

/** Redige o payload em estado terminal: nenhuma chave sensível fica em repouso. */
export function redactPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return redactSensitive(payload).value
}

@Injectable()
export class DeliveryDispatcher implements OnApplicationShutdown {
  private readonly log: AppLogger
  private running = false
  private stopped = false
  private inflight: Promise<void> | null = null

  constructor(
    @Inject(EMAIL_CHANNEL) private readonly email: ChannelPort,
    @Inject(NOTIFICATIONS_CONFIG) private readonly config: NotificationConfig,
    private readonly txm: TransactionManager,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("DeliveryDispatcher")
  }

  async onApplicationShutdown(): Promise<void> {
    // Drain: nenhum batch novo inicia e o em voo é aguardado antes do pool
    // fechar — elimina a corrida @Interval × pool.end.
    this.stopped = true
    if (this.inflight) {
      await this.inflight
    }
  }

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    // @Interval NÃO previne overlap de tick — o guard previne.
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

  /** Linhas terminais purgam após 30d (payload já redigido; isto é higiene). */
  @MaintenanceJob("delivery.purge")
  async purgeTerminal(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
    const deleted = await this.txm
      .getExecutor()
      .delete(notificationDeliveries)
      .where(
        and(
          inArray(notificationDeliveries.status, ["sent", "dead_letter"]),
          lt(notificationDeliveries.createdAt, cutoff)
        )
      )
      .returning({ id: notificationDeliveries.id })
    this.log.info("delivery.purge", { removed: deleted.length })
  }

  // Claim+lease transacional e curto; o envio roda FORA de tx (R17). O lock
  // FOR UPDATE solta no commit; a lease (next_attempt_at) impede re-claim por
  // outro tick/instância durante o envio. Crash entre claim e UPDATE → lease
  // expira → re-claim → Idempotency-Key (delivery.id) dedupa no provider.
  private async runBatch(): Promise<void> {
    try {
      const rows = await this.txm.run(async () => {
        const tx = this.txm.getExecutor()
        const claimed = await tx
          .select()
          .from(notificationDeliveries)
          .where(
            and(
              inArray(notificationDeliveries.status, ["pending", "failed"]),
              // now() do PG, não Date do JS: Date trunca pra ms e uma linha
              // inserida no mesmo ms (default now() com µs) ficaria invisível
              // pro claim — o insert commitou antes, logo now() daqui é maior.
              lte(notificationDeliveries.nextAttemptAt, sql`now()`)
            )
          )
          .orderBy(asc(notificationDeliveries.id))
          .limit(BATCH_SIZE)
          .for("update", { skipLocked: true })

        if (claimed.length > 0) {
          await tx
            .update(notificationDeliveries)
            .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
            .where(
              inArray(
                notificationDeliveries.id,
                claimed.map((r) => r.id)
              )
            )
        }
        return claimed
      })

      for (const row of rows) {
        await this.processClaimed(row)
      }
    } catch (err) {
      this.log.error("delivery.batch_failed", { err })
    }
  }

  private async processClaimed(row: DeliveryRow): Promise<void> {
    const payload = row.payload as Record<string, unknown>

    // Link com token já expirado: entregar é pior que não entregar (usuário
    // clica num link morto). Dead-letter direto, sem tentar o envio.
    const tokenExpiresAt =
      typeof payload.tokenExpiresAt === "string"
        ? new Date(payload.tokenExpiresAt)
        : null
    if (tokenExpiresAt && tokenExpiresAt.getTime() <= Date.now()) {
      await this.deadLetter(row, payload, "token expirado antes do envio")
      return
    }

    try {
      const channel = this.channelFor(row.channel)
      await channel.send({ id: row.id, type: row.type, payload })
      await this.txm
        .getExecutor()
        .update(notificationDeliveries)
        .set({
          status: "sent",
          sentAt: new Date(),
          payload: redactPayload(payload),
        })
        .where(eq(notificationDeliveries.id, row.id))
      this.log.info("delivery.sent", {
        deliveryId: row.id,
        type: row.type,
        channel: row.channel,
        attempts: row.attempts,
      })
    } catch (err) {
      await this.handleFailure(row, payload, err)
    }
  }

  private channelFor(channel: string): ChannelPort {
    if (channel === "email") {
      return this.email
    }
    throw new Error(`canal de delivery não implementado: ${channel}`)
  }

  private async handleFailure(
    row: DeliveryRow,
    payload: Record<string, unknown>,
    err: unknown
  ): Promise<void> {
    const attempts = row.attempts + 1
    const message = (err instanceof Error ? err.message : String(err)).slice(
      0,
      LAST_ERROR_MAX_LENGTH
    )
    if (attempts >= this.config.DELIVERY_MAX_ATTEMPTS) {
      await this.deadLetter(row, payload, message, attempts)
      return
    }
    await this.txm
      .getExecutor()
      .update(notificationDeliveries)
      .set({
        status: "failed",
        attempts,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      })
      .where(eq(notificationDeliveries.id, row.id))
    this.log.warn("delivery.failed", { deliveryId: row.id, attempts, err })
  }

  private async deadLetter(
    row: DeliveryRow,
    payload: Record<string, unknown>,
    message: string,
    attempts = row.attempts
  ): Promise<void> {
    await this.txm
      .getExecutor()
      .update(notificationDeliveries)
      .set({
        status: "dead_letter",
        attempts,
        lastError: message.slice(0, LAST_ERROR_MAX_LENGTH),
        payload: redactPayload(payload),
      })
      .where(eq(notificationDeliveries.id, row.id))
    // Payload/row NUNCA vão pro log (o token viaja no link) — só identificadores.
    this.log.error("delivery.dead_lettered", {
      deliveryId: row.id,
      type: row.type,
      channel: row.channel,
      attempts,
    })
  }
}

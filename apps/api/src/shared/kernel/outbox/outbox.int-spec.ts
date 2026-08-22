import { EventEmitter2 } from "@nestjs/event-emitter"
import { eq } from "drizzle-orm"


import {
  createTestDb,
  createTestPool,
  testDatabaseUrl,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { parseEnv } from "../../config/env"
import { DedicatedClientFactory } from "../../infra/database/dedicated-client.factory"
import { DomainEvent } from "../events/domain-event.base"
import { TransactionManager } from "../transactional/transaction-manager"

import { MAX_ATTEMPTS, OutboxDispatcher } from "./outbox.dispatcher"
import { OutboxPublisher } from "./outbox.publisher"
import { outbox, outboxDead } from "./outbox.table"
import { ProcessedEventsRepository } from "./processed-events.repository"

import type { NewOutboxRow } from "./outbox.table"
import type { Env } from "../../config/env"
import type { DrizzleDb } from "../../infra/database/drizzle.provider"
import type { ManagedDedicatedClient } from "../../infra/database/managed-dedicated-client"
import type {
  RequestContext,
  RequestContextStore,
} from "../context/request-context"
import type { EventEnvelope } from "../events/domain-event.base"
import type { LoggerFactory } from "../logging/logger.factory"
import type { Client, Pool } from "pg"

function connectionEnv(): Env {
  return parseEnv({
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  })
}

async function backendPid(client: Client): Promise<number> {
  const result = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid"
  )
  const pid = result.rows.at(0)?.pid
  if (pid === undefined) throw new Error("sem pid de backend")
  return pid
}

/** `events.once` rejeita se vier 'error' antes — e a queda server-side manda os dois. */
function endOf(client: Client): Promise<void> {
  return new Promise((resolve) => {
    client.once("end", () => {
      resolve()
    })
  })
}

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  label: string
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timeout esperando: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

function dedicatedListenClient(dispatcher: OutboxDispatcher): ManagedDedicatedClient {
  return (dispatcher as unknown as { listenClient: ManagedDedicatedClient })
    .listenClient
}

function store(): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId: "corr-1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "event",
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

interface InvoicePaidPayload {
  invoiceId: string
  orderId: string
  paidAt: string
}

class InvoicePaidEvent extends DomainEvent<InvoicePaidPayload> {
  static readonly EVENT_NAME = "invoice.paid"

  readonly eventName = InvoicePaidEvent.EVENT_NAME
  readonly eventVersion = 1

  static from(args: {
    aggregateId: string
    payload: InvoicePaidPayload
  }): InvoicePaidEvent {
    return new InvoicePaidEvent({
      aggregateId: args.aggregateId,
      aggregateType: "invoice",
      payload: args.payload,
    })
  }
}

function sampleEvent(aggregateId: string): InvoicePaidEvent {
  return InvoicePaidEvent.from({
    aggregateId,
    payload: {
      invoiceId: aggregateId,
      orderId: "o-1",
      paidAt: "2026-01-01T00:00:00.000Z",
    },
  })
}

function domainPayload(envelope: unknown): Record<string, unknown> {
  return (envelope as { payload: Record<string, unknown> }).payload
}

describe("Outbox (integração)", () => {
  let pool: Pool
  let db: DrizzleDb
  let ctx: RequestContext
  let loggerFactory: LoggerFactory
  let txm: TransactionManager
  let publisher: OutboxPublisher
  let processed: ProcessedEventsRepository
  let emitter: EventEmitter2
  let dispatcher: OutboxDispatcher
  let dedicatedClients: DedicatedClientFactory

  beforeAll(() => {
    // purgeDeadLetters lê a retenção de env(), que exige as chaves obrigatórias
    // no process.env — o setup de integração só resolve a conexão por helper.
    process.env.DATABASE_URL ??= testDatabaseUrl()
    process.env.WEB_ORIGIN ??= "http://localhost:5173"
    process.env.REDIS_URL ??= "redis://localhost:6379"
    pool = createTestPool()
    db = createTestDb(pool)
    const test = makeTestLogger()
    ctx = test.ctx
    loggerFactory = test.loggerFactory
    txm = new TransactionManager(db, loggerFactory)
    publisher = new OutboxPublisher(txm, ctx, loggerFactory)
    processed = new ProcessedEventsRepository(txm)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateKernel(pool)
    emitter = new EventEmitter2()
    dedicatedClients = new DedicatedClientFactory(
      loggerFactory.forModule("dedicated-teste"),
      connectionEnv()
    )
    dispatcher = new OutboxDispatcher(
      db,
      dedicatedClients,
      emitter,
      ctx,
      txm,
      loggerFactory
    )
  })

  afterEach(async () => {
    // Rede de segurança: fecha o client dedicado de LISTEN se o teste chamou
    // onModuleInit e não deu shutdown explícito (idempotente se já encerrado).
    await dedicatedClients.onApplicationShutdown()
  })

  it("publish dentro de tx grava o envelope com correlationId do contexto", async () => {
    await ctx.run(store(), () => txm.run(() => publisher.publish(sampleEvent("inv-1"))))

    const rows = await db.select().from(outbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventName).toBe("invoice.paid")
    expect(rows[0]?.correlationId).toBe("corr-1")
    expect(rows[0]?.publishedAt).toBeNull()
  })

  it("publish sem tx aberta lança", async () => {
    await expect(
      ctx.run(store(), () => publisher.publish(sampleEvent("inv-x")))
    ).rejects.toThrow(/transação/)
  })

  it("markIfNew retorna true só na primeira vez (dedupe)", async () => {
    const first = await txm.run(() => processed.markIfNew("evt-1", "consumer-x"))
    const second = await txm.run(() => processed.markIfNew("evt-1", "consumer-x"))
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it("wasProcessed enxerga só o par (evento, consumer) marcado e não marca nada", async () => {
    expect(await processed.wasProcessed("evt-2", "consumer-x")).toBe(false)
    expect(await processed.markIfNew("evt-2", "consumer-x")).toBe(true)

    expect(await processed.wasProcessed("evt-2", "consumer-x")).toBe(true)
    expect(await processed.wasProcessed("evt-2", "consumer-y")).toBe(false)
    expect(await processed.markIfNew("evt-2", "consumer-y")).toBe(true)
  })

  it("dispatcher emite o evento ao listener e marca published_at", async () => {
    const received: unknown[] = []
    emitter.on(InvoicePaidEvent.EVENT_NAME, (envelope: unknown) => {
      received.push(envelope)
    })

    await ctx.run(store(), () => txm.run(() => publisher.publish(sampleEvent("inv-9"))))
    await dispatcher.poll()

    expect(received).toHaveLength(1)
    const rows = await db.select().from(outbox)
    expect(rows[0]?.publishedAt).not.toBeNull()
  })

  it("falha do handler incrementa attempts e não marca published", async () => {
    emitter.on("fail.event", () => {
      throw new Error("handler explodiu")
    })
    await db.insert(outbox).values({
      eventId: "fail-1",
      eventName: "fail.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "fail.event",
        eventId: "fail-1",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
    })

    await dispatcher.poll()

    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "fail-1"))
    expect(rows[0]?.publishedAt).toBeNull()
    expect(rows[0]?.attempts).toBe(1)
    expect(rows[0]?.lastError).toContain("explodiu")
  })

  it("após MAX_ATTEMPTS move a linha para outbox_dead e remove de outbox", async () => {
    emitter.on("fail.event", () => {
      throw new Error("handler explodiu")
    })
    const occurredAt = new Date("2026-01-01T00:00:00.000Z")
    await db.insert(outbox).values({
      eventId: "dead-1",
      eventName: "fail.event",
      eventVersion: 1,
      aggregateId: "agg-dead",
      aggregateType: "t",
      payload: {
        eventName: "fail.event",
        eventId: "dead-1",
        correlationId: "c",
        causationId: "cause-1",
        tenantId: "tenant-1",
        traceparent: "tp-1",
        payload: {},
      },
      correlationId: "c",
      causationId: "cause-1",
      tenantId: "tenant-1",
      traceparent: "tp-1",
      occurredAt,
      attempts: MAX_ATTEMPTS - 1,
      nextAttemptAt: new Date(0),
    })

    await dispatcher.poll()

    const live = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "dead-1"))
    expect(live).toHaveLength(0)

    const dead = await db
      .select()
      .from(outboxDead)
      .where(eq(outboxDead.eventId, "dead-1"))
    expect(dead).toHaveLength(1)
    expect(dead[0]?.attempts).toBe(MAX_ATTEMPTS)
    expect(dead[0]?.lastError).toContain("explodiu")
    expect(dead[0]?.aggregateId).toBe("agg-dead")
    expect(dead[0]?.correlationId).toBe("c")
    expect(dead[0]?.causationId).toBe("cause-1")
    expect(dead[0]?.tenantId).toBe("tenant-1")
    expect(dead[0]?.traceparent).toBe("tp-1")
  })

  it("não retém lock durante o handler (IO fora da tx)", async () => {
    let release!: () => void
    let handlerEntered!: () => void
    const blocked = new Promise<void>((r) => {
      release = r
    })
    const entered = new Promise<void>((r) => {
      handlerEntered = r
    })
    // emitAsync aguarda o promise retornado; o tipo de .on é void-return, daí
    // o cast (não há misuse — o dispatcher de fato awaita).
    const slowListener = (): Promise<void> => {
      handlerEntered()
      return blocked
    }
    emitter.on("slow.event", slowListener as () => void)

    await db.insert(outbox).values({
      eventId: "slow-1",
      eventName: "slow.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "slow.event",
        eventId: "slow-1",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
    })

    const polling = dispatcher.poll()
    await entered // handler rodando → fase 1 (claim) já commitou

    // Outra leitura FOR UPDATE SKIP LOCKED pega a linha: ela NÃO está locked
    // (o claim commitou e a emissão roda fora de tx).
    const notLocked = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "slow-1"))
      .for("update", { skipLocked: true })
    expect(notLocked).toHaveLength(1)

    release()
    await polling

    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "slow-1"))
    expect(rows[0]?.publishedAt).not.toBeNull()
  })

  it("dois dispatchers concorrentes entregam cada evento uma vez", async () => {
    const received: string[] = []
    emitter.on("multi.event", (env: EventEnvelope) => {
      received.push(env.eventId)
    })
    for (let i = 0; i < 6; i++) {
      await db.insert(outbox).values({
        eventId: `m-${i}`,
        eventName: "multi.event",
        eventVersion: 1,
        aggregateId: "a",
        aggregateType: "t",
        payload: {
          eventName: "multi.event",
          eventId: `m-${i}`,
          correlationId: "c",
          causationId: null,
          tenantId: null,
          traceparent: null,
          payload: {},
        },
        correlationId: "c",
        occurredAt: new Date(),
      })
    }

    const d2 = new OutboxDispatcher(
      db,
      dedicatedClients,
      emitter,
      ctx,
      txm,
      loggerFactory
    )
    await Promise.all([dispatcher.poll(), d2.poll()])

    expect(received.sort()).toEqual(["m-0", "m-1", "m-2", "m-3", "m-4", "m-5"])
    const rows = await db.select().from(outbox)
    expect(rows.every((r) => r.publishedAt !== null)).toBe(true)
  })

  it("no-listeners: não marca published, reentra com lastError 'sem listener'", async () => {
    await db.insert(outbox).values({
      eventId: "orphan-1",
      eventName: "orphan.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "orphan.event",
        eventId: "orphan-1",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
    })

    await dispatcher.poll()

    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "orphan-1"))
    expect(rows[0]?.publishedAt).toBeNull()
    expect(rows[0]?.attempts).toBe(1)
    expect(rows[0]?.lastError).toContain("sem listener")
  })

  it("no-listeners vai a dead após MAX_ATTEMPTS", async () => {
    await db.insert(outbox).values({
      eventId: "orphan-dead",
      eventName: "orphan.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "orphan.event",
        eventId: "orphan-dead",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
      attempts: MAX_ATTEMPTS - 1,
      nextAttemptAt: new Date(0),
    })

    await dispatcher.poll()

    const live = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "orphan-dead"))
    expect(live).toHaveLength(0)
    const dead = await db
      .select()
      .from(outboxDead)
      .where(eq(outboxDead.eventId, "orphan-dead"))
    expect(dead[0]?.lastError).toContain("sem listener")
  })

  it("dead-letter idempotente: replay não viola PK e preserva o dead original", async () => {
    await db.insert(outboxDead).values({
      eventId: "dup-dead",
      eventName: "fail.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "fail.event",
        eventId: "dup-dead",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
      attempts: MAX_ATTEMPTS,
      lastError: "erro original",
    })
    emitter.on("fail.event", () => {
      throw new Error("explodiu de novo")
    })
    await db.insert(outbox).values({
      eventId: "dup-dead",
      eventName: "fail.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "fail.event",
        eventId: "dup-dead",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
      attempts: MAX_ATTEMPTS - 1,
      nextAttemptAt: new Date(0),
    })

    await dispatcher.poll()

    const live = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "dup-dead"))
    expect(live).toHaveLength(0) // removido de outbox (insert no-op não barrou)
    const dead = await db
      .select()
      .from(outboxDead)
      .where(eq(outboxDead.eventId, "dup-dead"))
    expect(dead).toHaveLength(1)
    expect(dead[0]?.lastError).toBe("erro original") // não sobrescrito
  })

  describe("LISTEN em client dedicado (T13 / POOL-06)", () => {
    function notifyRow(eventId: string): NewOutboxRow {
      return {
        eventId,
        eventName: "notify.event",
        eventVersion: 1,
        aggregateId: "a",
        aggregateType: "t",
        payload: {
          eventName: "notify.event",
          eventId,
          correlationId: "c",
          causationId: null,
          tenantId: null,
          traceparent: null,
          payload: {},
        },
        correlationId: "c",
        occurredAt: new Date(),
      }
    }

    async function publishedAt(eventId: string): Promise<Date | null> {
      const rows = await db
        .select()
        .from(outbox)
        .where(eq(outbox.eventId, eventId))
      return rows[0]?.publishedAt ?? null
    }

    beforeEach(() => {
      emitter.on("notify.event", () => undefined)
    })

    it("boot não deixa detentor permanente no pool de aplicação", async () => {
      // Usa o pool antes do boot pra a comparação não ser vazia (totalCount>0).
      await pool.query("SELECT 1")

      await dispatcher.onModuleInit()

      // O LISTEN de fato conectou fora do pool — senão a comparação abaixo
      // passaria mesmo sem o dispatcher ter feito nada.
      expect(dedicatedClients.liveCount()).toBe(1)
      expect(pool.totalCount).toBeGreaterThan(0)
      expect(pool.totalCount - pool.idleCount).toBe(0)
    })

    it("NOTIFY acorda o dispatch mesmo com o LISTEN fora do pool", async () => {
      await dispatcher.onModuleInit()

      // O trigger outbox_notify_trigger dispara pg_notify no INSERT — nenhum
      // poll() é chamado aqui: só o LISTEN pode publicar esta linha.
      await db.insert(outbox).values(notifyRow("listen-wake-1"))

      await waitUntil(
        async () => (await publishedAt("listen-wake-1")) !== null,
        "NOTIFY acordar o dispatch"
      )
    })

    it("após pg_terminate_backend no client do LISTEN, ele se recria e volta a acordar", async () => {
      await dispatcher.onModuleInit()
      const managed = dedicatedListenClient(dispatcher)
      const first = await managed.ensure()
      const pid = await backendPid(first)
      const ended = endOf(first)

      await pool.query("SELECT pg_terminate_backend($1)", [pid])
      await ended
      expect(dedicatedClients.liveCount()).toBe(0)

      // Único poll: reconecta e reLISTEN. A publicação abaixo depende só do
      // NOTIFY do INSERT seguinte, não de outra chamada a poll().
      await dispatcher.poll()
      expect(dedicatedClients.liveCount()).toBe(1)
      const second = await managed.ensure()
      expect(second).not.toBe(first)

      await db.insert(outbox).values(notifyRow("listen-reconnect-1"))

      await waitUntil(
        async () => (await publishedAt("listen-reconnect-1")) !== null,
        "NOTIFY acordar o dispatch após a reconexão"
      )
    })

    it("shutdown encerra o client dedicado sem handle vazado", async () => {
      await dispatcher.onModuleInit()
      expect(dedicatedClients.liveCount()).toBe(1)

      await dispatcher.onApplicationShutdown()

      expect(dedicatedClients.liveCount()).toBe(0)
    })
  })

  it("shutdown drena o dispatch em voo e impede novos", async () => {
    let release!: () => void
    let entered!: () => void
    const blocked = new Promise<void>((r) => {
      release = r
    })
    const started = new Promise<void>((r) => {
      entered = r
    })
    const slow = (): Promise<void> => {
      entered()
      return blocked
    }
    emitter.on("drain.event", slow as () => void)

    await db.insert(outbox).values({
      eventId: "drain-1",
      eventName: "drain.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "drain.event",
        eventId: "drain-1",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
    })

    const polling = dispatcher.poll()
    await started // handler em voo (fase 2)

    const shutdown = dispatcher.onApplicationShutdown()
    release() // libera o handler → o inflight resolve
    await shutdown
    await polling

    // O em-voo completou (não foi abortado).
    const drained = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "drain-1"))
    expect(drained[0]?.publishedAt).not.toBeNull()

    // Após stopped, novos polls são no-op.
    await db.insert(outbox).values({
      eventId: "after-stop",
      eventName: "drain.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "drain.event",
        eventId: "after-stop",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {},
      },
      correlationId: "c",
      occurredAt: new Date(),
    })
    await dispatcher.poll()
    const after = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "after-stop"))
    expect(after[0]?.publishedAt).toBeNull()
  })

  it("FIFO-por-aggregate intra-batch: mesma aggregate em ordem de occurred_at", async () => {
    const arrivals: string[] = []
    emitter.on("fifo.event", (env: EventEnvelope) => {
      arrivals.push(env.eventId)
    })
    const base = new Date("2026-01-01T00:00:00.000Z").getTime()
    const rows = [
      { id: "A-3", agg: "agg-A", at: base + 3000 },
      { id: "B-1", agg: "agg-B", at: base + 1000 },
      { id: "A-1", agg: "agg-A", at: base + 1000 },
      { id: "B-2", agg: "agg-B", at: base + 2000 },
      { id: "A-2", agg: "agg-A", at: base + 2000 },
    ]
    for (const r of rows) {
      await db.insert(outbox).values({
        eventId: r.id,
        eventName: "fifo.event",
        eventVersion: 1,
        aggregateId: r.agg,
        aggregateType: "t",
        payload: {
          eventName: "fifo.event",
          eventId: r.id,
          correlationId: "c",
          causationId: null,
          tenantId: null,
          traceparent: null,
          payload: {},
        },
        correlationId: "c",
        occurredAt: new Date(r.at),
      })
    }

    await dispatcher.poll()

    const aOrder = arrivals.filter((id) => id.startsWith("A-"))
    expect(aOrder).toEqual(["A-1", "A-2", "A-3"])
  })

  it("purgePublished remove published>30d, preserva recente e unpublished", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000)
    const yesterday = new Date(Date.now() - 86_400_000)
    const insert = (eventId: string, publishedAt: Date | null, occurredAt: Date) =>
      db.insert(outbox).values({
        eventId,
        eventName: "x.event",
        eventVersion: 1,
        aggregateId: "a",
        aggregateType: "t",
        payload: {
          eventName: "x.event",
          eventId,
          correlationId: "c",
          causationId: null,
          tenantId: null,
          traceparent: null,
          payload: {},
        },
        correlationId: "c",
        occurredAt,
        publishedAt,
      })
    await insert("old-pub", old, old)
    await insert("recent-pub", yesterday, yesterday)
    await insert("pending", null, yesterday)

    await dispatcher.purgePublished()

    const remaining = (await db.select().from(outbox))
      .map((r) => r.eventId)
      .sort()
    expect(remaining).toEqual(["pending", "recent-pub"])
  })
  it("ao marcar published redige a chave sensível do envelope (REM-16)", async () => {
    emitter.on("notification.requested", () => undefined)
    await db.insert(outbox).values({
      eventId: "notif-secret",
      eventName: "notification.requested",
      eventVersion: 1,
      aggregateId: "n-1",
      aggregateType: "notification",
      payload: {
        eventName: "notification.requested",
        eventId: "notif-secret",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: {
          recipientId: "user-1",
          link: "https://app.example/definir-senha?token=cru-123",
        },
      },
      correlationId: "c",
      occurredAt: new Date(),
    })

    await dispatcher.poll()

    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "notif-secret"))
    expect(rows[0]?.publishedAt).not.toBeNull()
    const stored = domainPayload(rows[0]?.payload)
    expect(stored.link).toBe("[REDACTED]")
    expect(stored.recipientId).toBe("user-1")
    expect(JSON.stringify(rows[0]?.payload)).not.toContain("cru-123")
  })

  it("payload sem chave redigível fica idêntico após publish", async () => {
    emitter.on("plain.event", () => undefined)
    await db.insert(outbox).values({
      eventId: "plain-1",
      eventName: "plain.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "plain.event",
        eventId: "plain-1",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: { invoiceId: "inv-1", amountCents: 1234 },
      },
      correlationId: "c",
      occurredAt: new Date(),
    })
    const before = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "plain-1"))

    await dispatcher.poll()

    const after = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventId, "plain-1"))
    expect(after[0]?.publishedAt).not.toBeNull()
    expect(JSON.stringify(after[0]?.payload)).toBe(
      JSON.stringify(before[0]?.payload)
    )
  })

  it("dead-letter redige o payload de domínio aninhado (REM-16)", async () => {
    emitter.on("fail.event", () => {
      throw new Error("handler explodiu")
    })
    await db.insert(outbox).values({
      eventId: "dead-secret",
      eventName: "fail.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: {
        eventName: "fail.event",
        eventId: "dead-secret",
        correlationId: "c",
        causationId: null,
        tenantId: null,
        traceparent: null,
        payload: { token: "cru-456", recipientId: "user-2" },
      },
      correlationId: "c",
      occurredAt: new Date(),
      attempts: MAX_ATTEMPTS - 1,
      nextAttemptAt: new Date(0),
    })

    await dispatcher.poll()

    const dead = await db
      .select()
      .from(outboxDead)
      .where(eq(outboxDead.eventId, "dead-secret"))
    expect(dead).toHaveLength(1)
    const stored = domainPayload(dead[0]?.payload)
    expect(stored.token).toBe("[REDACTED]")
    expect(stored.recipientId).toBe("user-2")
    expect(JSON.stringify(dead[0]?.payload)).not.toContain("cru-456")
  })
  it("purgeDeadLetters remove dead>retenção e preserva o recente (REM-17)", async () => {
    const retentionDays = connectionEnv().OUTBOX_DEAD_RETENTION_DAYS
    const insertDead = (eventId: string, deadLetteredAt: Date) =>
      db.insert(outboxDead).values({
        eventId,
        eventName: "x.event",
        eventVersion: 1,
        aggregateId: "a",
        aggregateType: "t",
        payload: {
          eventName: "x.event",
          eventId,
          correlationId: "c",
          causationId: null,
          tenantId: null,
          traceparent: null,
          payload: {},
        },
        correlationId: "c",
        occurredAt: new Date(),
        attempts: MAX_ATTEMPTS,
        lastError: "explodiu",
        deadLetteredAt,
      })
    const dayMs = 86_400_000
    await insertDead("dead-old", new Date(Date.now() - (retentionDays + 1) * dayMs))
    await insertDead("dead-new", new Date(Date.now() - (retentionDays - 1) * dayMs))

    await dispatcher.purgeDeadLetters()

    const remaining = (await db.select().from(outboxDead)).map((r) => r.eventId)
    expect(remaining).toEqual(["dead-new"])
  })
})

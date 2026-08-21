import { ulid } from "ulid"

import { createTestDb, createTestPool } from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import { DeliveryDispatcher } from "./delivery.dispatcher"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { ChannelPort } from "../../domain/ports/channel.port"
import type { NotificationConfig } from "../../notification.config"
import type { Pool } from "pg"

const config = { DELIVERY_MAX_ATTEMPTS: 2, MAIL_TRANSPORT: "log" } as NotificationConfig

function insertDelivery(
  pool: Pool,
  over: Partial<{
    id: string
    payload: Record<string, unknown>
    status: string
    channel: string
    createdAt: Date
  }> = {}
) {
  const id = over.id ?? ulid()
  const payload = over.payload ?? { email: "a@b.com", link: "https://x/?token=raw", locale: "pt-BR" }
  return pool
    .query(
      `insert into notification.notification_deliveries
         (id, recipient_id, type, channel, payload, status, created_at)
       values ($1, 'u1', 'password_reset_requested', $4, $2, $3, $5)`,
      [
        id,
        JSON.stringify(payload),
        over.status ?? "pending",
        over.channel ?? "email",
        over.createdAt ?? new Date(),
      ]
    )
    .then(() => id)
}

describe("DeliveryDispatcher (int)", () => {
  let pool: Pool
  let db: DrizzleDb
  let sent: string[]
  let failNext: boolean
  let dispatcher: DeliveryDispatcher
  let txm: TransactionManager
  let loggerFactory: ReturnType<typeof makeTestLogger>["loggerFactory"]

  const channel: ChannelPort = {
    async send(input) {
      if (failNext) throw new Error("smtp indisponível")
      sent.push(input.id)
    },
  }

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    loggerFactory = makeTestLogger().loggerFactory
    txm = new TransactionManager(db, loggerFactory)
    dispatcher = new DeliveryDispatcher(channel, config, txm, loggerFactory)
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(async () => {
    sent = []
    failNext = false
    await pool.query("truncate table notification.notification_deliveries")
  })

  async function row(id: string) {
    const r = await pool.query(
      "select * from notification.notification_deliveries where id = $1",
      [id]
    )
    return r.rows[0]
  }

  it("envia pending, marca sent e REDIGE o link do payload", async () => {
    const id = await insertDelivery(pool)
    await dispatcher.poll()
    expect(sent).toEqual([id])
    const r = await row(id)
    expect(r.status).toBe("sent")
    expect(r.sent_at).not.toBeNull()
    expect(r.payload.link).toBe("[REDACTED]")
    expect(r.payload.email).toBe("a@b.com")
  })

  it("falha → failed com backoff; novo poll dentro da lease NÃO re-envia", async () => {
    const id = await insertDelivery(pool)
    failNext = true
    await dispatcher.poll()
    const r = await row(id)
    expect(r.status).toBe("failed")
    expect(r.attempts).toBe(1)
    expect(r.last_error).toContain("smtp")
    expect(new Date(r.next_attempt_at).getTime()).toBeGreaterThan(Date.now())

    failNext = false
    await dispatcher.poll()
    expect(sent).toEqual([])
  })

  it("MAX_ATTEMPTS → dead_letter com payload redigido", async () => {
    const id = await insertDelivery(pool)
    failNext = true
    await dispatcher.poll()
    // vence o backoff/lease pra reprocessar já
    await pool.query(
      "update notification.notification_deliveries set next_attempt_at = now() where id = $1",
      [id]
    )
    await dispatcher.poll()
    const r = await row(id)
    expect(r.status).toBe("dead_letter")
    expect(r.attempts).toBe(2)
    expect(r.payload.link).toBe("[REDACTED]")
  })

  it("token expirado → dead_letter SEM enviar", async () => {
    const id = await insertDelivery(pool, {
      payload: {
        email: "a@b.com",
        link: "https://x/?token=raw",
        tokenExpiresAt: "2020-01-01T00:00:00.000Z",
        locale: "pt-BR",
      },
    })
    await dispatcher.poll()
    expect(sent).toEqual([])
    const r = await row(id)
    expect(r.status).toBe("dead_letter")
    expect(r.last_error).toContain("token expirado")
    expect(r.payload.link).toBe("[REDACTED]")
  })

  it("canal sem channel port (push) → failed com erro descritivo, sem enviar", async () => {
    const id = await insertDelivery(pool, { channel: "push" })
    await dispatcher.poll()
    expect(sent).toEqual([])
    const r = await row(id)
    expect(r.status).toBe("failed")
    expect(r.last_error).toContain("canal de delivery não implementado")
  })

  it("dois polls concorrentes entregam cada delivery uma vez (lease preservada)", async () => {
    const ids = await Promise.all(
      Array.from({ length: 6 }, (_, i) => insertDelivery(pool, { id: `d-${i}` }))
    )

    const d2 = new DeliveryDispatcher(channel, config, txm, loggerFactory)
    await Promise.all([dispatcher.poll(), d2.poll()])

    expect(sent.sort()).toEqual([...ids].sort())
    const r = await pool.query(
      "select id, status from notification.notification_deliveries"
    )
    expect(
      r.rows.every((row: { status: string }) => row.status === "sent")
    ).toBe(true)
  })

  it("purgeTerminal remove sent/dead_letter com 30d+; preserva pending e terminais recentes", async () => {
    const old = new Date(Date.now() - 31 * 86_400_000)
    const oldSent = await insertDelivery(pool, { status: "sent", createdAt: old })
    const oldDead = await insertDelivery(pool, { status: "dead_letter", createdAt: old })
    const oldPending = await insertDelivery(pool, { status: "pending", createdAt: old })
    const newSent = await insertDelivery(pool, { status: "sent" })

    await dispatcher.purgeTerminal()

    const r = await pool.query(
      "select id from notification.notification_deliveries order by id"
    )
    const remaining = r.rows.map((x: { id: string }) => x.id)
    expect(remaining).not.toContain(oldSent)
    expect(remaining).not.toContain(oldDead)
    expect(remaining).toContain(oldPending)
    expect(remaining).toContain(newSent)
  })
})

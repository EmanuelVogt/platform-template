import { eq } from "drizzle-orm"

import {
  createTestDb,
  createTestPool,
  truncateKernel,
} from "../../test/setup/test-db"
import { outbox, outboxDead } from "../shared/kernel/outbox/outbox.table"

import { replayByEventId, replaySince } from "./outbox-replay"

import type { DrizzleDb } from "../shared/infra/database/drizzle.provider"
import type { Pool } from "pg"

function envelope(eventId: string) {
  return {
    eventName: "x.event",
    eventId,
    correlationId: "c",
    causationId: null,
    tenantId: null,
    traceparent: null,
    payload: {},
  }
}

describe("outbox-replay (integração)", () => {
  let pool: Pool
  let db: DrizzleDb

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateKernel(pool)
  })

  it("replayByEventId reseta uma linha publicada", async () => {
    await db.insert(outbox).values({
      eventId: "r-1",
      eventName: "x.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: envelope("r-1"),
      correlationId: "c",
      occurredAt: new Date(),
      publishedAt: new Date(),
      attempts: 3,
    })

    expect(await replayByEventId(db, "r-1")).toBe(1)

    const rows = await db.select().from(outbox).where(eq(outbox.eventId, "r-1"))
    expect(rows[0]?.publishedAt).toBeNull()
    expect(rows[0]?.attempts).toBe(0)
  })

  // O dead letter já nasce redigido (REM-16): o replay o reinsere como está, sem
  // ressuscitar segredo nenhum. Evento portador de segredo não se replaya — o
  // fluxo dono reemite (novo link, novo token).
  it("replayByEventId reinsere do dead preservando a redaction", async () => {
    await db.insert(outboxDead).values({
      eventId: "d-1",
      eventName: "x.event",
      eventVersion: 1,
      aggregateId: "a",
      aggregateType: "t",
      payload: { ...envelope("d-1"), payload: { link: "[REDACTED]" } },
      correlationId: "c",
      occurredAt: new Date(),
      attempts: 8,
      lastError: "explodiu",
    })

    expect(await replayByEventId(db, "d-1")).toBe(1)

    const live = await db.select().from(outbox).where(eq(outbox.eventId, "d-1"))
    expect(live).toHaveLength(1)
    expect(live[0]?.publishedAt).toBeNull()
    expect(live[0]?.payload).toEqual({
      ...envelope("d-1"),
      payload: { link: "[REDACTED]" },
    })
    const dead = await db
      .select()
      .from(outboxDead)
      .where(eq(outboxDead.eventId, "d-1"))
    expect(dead).toHaveLength(0)
  })

  it("replayByEventId retorna 0 para id inexistente", async () => {
    expect(await replayByEventId(db, "nope")).toBe(0)
  })

  it("replaySince reseta só os publicados desde a data", async () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z")
    const mk = (eventId: string, occurredAt: Date) =>
      db.insert(outbox).values({
        eventId,
        eventName: "x.event",
        eventVersion: 1,
        aggregateId: "a",
        aggregateType: "t",
        payload: envelope(eventId),
        correlationId: "c",
        occurredAt,
        publishedAt: new Date(),
      })
    await mk("s-old", new Date("2025-12-01T00:00:00.000Z"))
    await mk("s-new", new Date("2026-02-01T00:00:00.000Z"))

    expect(await replaySince(db, cutoff)).toBe(1)

    const sNew = await db.select().from(outbox).where(eq(outbox.eventId, "s-new"))
    expect(sNew[0]?.publishedAt).toBeNull()
    const sOld = await db.select().from(outbox).where(eq(outbox.eventId, "s-old"))
    expect(sOld[0]?.publishedAt).not.toBeNull()
  })
})

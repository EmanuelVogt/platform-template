import { Pool } from "pg"
import { ulid } from "ulid"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  testDatabaseUrl,
  truncateAttachment,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { attachmentAccessLogs } from "../tables/attachment-access-log.table"

import { DrizzleAttachmentAccessLogRepository } from "./drizzle-attachment-access-log.repository"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { AccessLogEntry } from "../../domain/ports/attachment-access-log.repository"

const CUTOFF = new Date("2026-07-01T00:00:00.000Z")

describe("DrizzleAttachmentAccessLogRepository.deleteBatchOlderThan", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzleAttachmentAccessLogRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleAttachmentAccessLogRepository(txm)
  })

  afterEach(async () => {
    await truncateAttachment(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedLog(createdAt: Date): Promise<string> {
    const id = ulid()
    await db.insert(attachmentAccessLogs).values({
      id,
      attachmentId: "att-1",
      userId: null,
      ip: null,
      userAgent: null,
      action: "download",
      outcome: "allowed",
      correlationId: null,
      createdAt,
    })
    return id
  }

  it("apaga só o vencido, preserva o dentro da janela", async () => {
    await seedLog(new Date("2026-06-01T00:00:00.000Z"))
    await seedLog(new Date("2026-06-15T00:00:00.000Z"))
    const kept = await seedLog(new Date("2026-07-05T00:00:00.000Z"))

    const removed = await repo.deleteBatchOlderThan(CUTOFF, 100)

    expect(removed).toBe(2)
    const rows = await db.select().from(attachmentAccessLogs)
    expect(rows.map((r) => r.id)).toEqual([kept])
  })

  it("respeita o limit apagando dos mais antigos primeiro", async () => {
    await seedLog(new Date("2026-06-01T00:00:00.000Z"))
    const newest = await seedLog(new Date("2026-06-20T00:00:00.000Z"))
    await seedLog(new Date("2026-06-10T00:00:00.000Z"))

    const removed = await repo.deleteBatchOlderThan(CUTOFF, 2)

    expect(removed).toBe(2)
    const rows = await db.select().from(attachmentAccessLogs)
    expect(rows.map((r) => r.id)).toEqual([newest])
  })

  it("retorna 0 quando nada vencido", async () => {
    await seedLog(new Date("2026-07-05T00:00:00.000Z"))

    expect(await repo.deleteBatchOlderThan(CUTOFF, 100)).toBe(0)
  })
})

describe("DrizzleAttachmentAccessLogRepository.listByAttachment", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzleAttachmentAccessLogRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleAttachmentAccessLogRepository(txm)
  })

  afterEach(async () => {
    await truncateAttachment(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedLog(input: {
    attachmentId: string
    createdAt: Date
    outcome?: "allowed" | "denied"
    userId?: string | null
  }): Promise<string> {
    const id = ulid()
    await db.insert(attachmentAccessLogs).values({
      id,
      attachmentId: input.attachmentId,
      userId: input.userId ?? null,
      ip: null,
      userAgent: null,
      action: "download",
      outcome: input.outcome ?? "allowed",
      correlationId: null,
      createdAt: input.createdAt,
    })
    return id
  }

  it("devolve só allowed, mais recente primeiro (FILE-16)", async () => {
    const older = await seedLog({
      attachmentId: "att-1",
      createdAt: new Date("2026-08-01T09:00:00.000Z"),
    })
    const newer = await seedLog({
      attachmentId: "att-1",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    })
    await seedLog({
      attachmentId: "att-1",
      createdAt: new Date("2026-08-01T11:00:00.000Z"),
      outcome: "denied",
    })
    await seedLog({
      attachmentId: "att-2",
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    })

    const rows = await repo.listByAttachment("att-1", 50)

    expect(rows.map((r) => r.id)).toEqual([newer, older])
    expect(rows.every((r) => r.attachmentId === "att-1")).toBe(true)
  })

  it("respeita o limite (FILE-16)", async () => {
    await seedLog({
      attachmentId: "att-1",
      createdAt: new Date("2026-08-01T08:00:00.000Z"),
    })
    const mid = await seedLog({
      attachmentId: "att-1",
      createdAt: new Date("2026-08-01T09:00:00.000Z"),
    })
    const newest = await seedLog({
      attachmentId: "att-1",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    })

    const rows = await repo.listByAttachment("att-1", 2)

    expect(rows.map((r) => r.id)).toEqual([newest, mid])
  })

  it("anexo sem acesso devolve lista vazia (FILE-16)", async () => {
    await seedLog({
      attachmentId: "att-other",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    })

    expect(await repo.listByAttachment("att-missing", 50)).toEqual([])
  })
})

// POOL-00: pool com uma única conexão — se o repositório pedir uma 2ª conexão
// enquanto a tx do `txm.run` segura a única, `connectionTimeoutMillis` curto
// derruba o teste rápido em vez de travar para sempre (prova viva da regressão).
describe("DrizzleAttachmentAccessLogRepository — sem 2ª conexão do pool (POOL-00)", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager
  let repo: DrizzleAttachmentAccessLogRepository

  beforeAll(() => {
    pool = new Pool({
      connectionString: testDatabaseUrl(),
      max: 1,
      connectionTimeoutMillis: 500,
    })
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleAttachmentAccessLogRepository(txm)
  })

  afterEach(async () => {
    await truncateAttachment(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedRow(input: { attachmentId: string; createdAt: Date }): Promise<string> {
    const id = ulid()
    await db.insert(attachmentAccessLogs).values({
      id,
      attachmentId: input.attachmentId,
      userId: null,
      ip: null,
      userAgent: null,
      action: "download",
      outcome: "allowed",
      correlationId: null,
      createdAt: input.createdAt,
    })
    return id
  }

  it("listByAttachment completa dentro de txm.run com pool de 1 conexão", async () => {
    const older = await seedRow({
      attachmentId: "att-pool",
      createdAt: new Date("2026-08-01T09:00:00.000Z"),
    })
    const newer = await seedRow({
      attachmentId: "att-pool",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    })

    const rows = await txm.run(() => repo.listByAttachment("att-pool", 50))

    expect(rows.map((r) => r.id)).toEqual([newer, older])
  })

  it("deleteBatchOlderThan completa dentro de txm.run com pool de 1 conexão e apaga exatamente o vencido", async () => {
    await seedRow({
      attachmentId: "att-pool",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    await seedRow({
      attachmentId: "att-pool",
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
    })
    const kept = await seedRow({
      attachmentId: "att-pool",
      createdAt: new Date("2026-07-05T00:00:00.000Z"),
    })

    const removed = await txm.run(() => repo.deleteBatchOlderThan(CUTOFF, 100))

    expect(removed).toBe(2)
    const rows = await db.select().from(attachmentAccessLogs)
    expect(rows.map((r) => r.id)).toEqual([kept])
  })
})

describe("DrizzleAttachmentAccessLogRepository.record/recordInTx", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager
  let repo: DrizzleAttachmentAccessLogRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleAttachmentAccessLogRepository(txm)
  })

  afterEach(async () => {
    await truncateAttachment(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  function makeEntry(attachmentId: string): AccessLogEntry {
    return {
      attachmentId,
      userId: "user-1",
      ip: "203.0.113.5",
      userAgent: "jest",
      action: "download",
      outcome: "denied",
      correlationId: "corr-access",
    }
  }

  it("record grava fora de tx", async () => {
    await repo.record(makeEntry("att-outside-tx"))
    const rows = await db.select().from(attachmentAccessLogs)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.attachmentId).toBe("att-outside-tx")
    expect(rows[0]?.outcome).toBe("denied")
  })

  it("record lança dentro de uma transação de negócio (pede 2ª conexão)", async () => {
    await expect(
      txm.run(() => repo.record(makeEntry("att-inside-tx")))
    ).rejects.toThrow(/transação ativa/)
    expect(await db.select().from(attachmentAccessLogs)).toHaveLength(0)
  })

  it("recordInTx lança fora de uma transação", async () => {
    await expect(repo.recordInTx(makeEntry("att-no-tx"))).rejects.toThrow(
      /transação aberta/
    )
    expect(await db.select().from(attachmentAccessLogs)).toHaveLength(0)
  })

  it("recordInTx some quando a tx de negócio dá rollback", async () => {
    await expect(
      txm.run(async () => {
        await repo.recordInTx(makeEntry("att-rollback"))
        throw new Error("rollback forçado")
      })
    ).rejects.toThrow("rollback forçado")
    expect(await db.select().from(attachmentAccessLogs)).toHaveLength(0)
  })

  it("recordInTx grava exatamente uma linha quando a tx de negócio comita", async () => {
    await txm.run(() => repo.recordInTx(makeEntry("att-commit")))
    const rows = await db.select().from(attachmentAccessLogs)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.attachmentId).toBe("att-commit")
    expect(rows[0]?.outcome).toBe("denied")
  })
})

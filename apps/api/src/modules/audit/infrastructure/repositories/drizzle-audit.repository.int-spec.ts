import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { UserDirectoryFacade } from "../../../identity/api/facades/user-directory.facade"
import { DrizzleUserRepository } from "../../../identity/infrastructure/repositories/drizzle-user.repository"

import { DrizzleAuditRepository } from "./drizzle-audit.repository"

import type { Pool } from "pg"

type Seed = {
  occurredAt: Date
  table: string
  entityId?: string
  op?: "insert" | "update" | "delete"
  actorUserId?: string | null
  txId?: number
  rowNew?: Record<string, unknown>
  origin?: string
}

describe("DrizzleAuditRepository (int)", () => {
  let pool: Pool
  let repo: DrizzleAuditRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    const users = new UserDirectoryFacade(new DrizzleUserRepository(txm))
    repo = new DrizzleAuditRepository(txm, users)
  })

  beforeEach(async () => {
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seed(s: Seed): Promise<void> {
    await pool.query(
      `INSERT INTO audit.entries
        (occurred_at, schema_name, table_name, entity_id, op, changed_keys, row_new, actor_user_id, origin, tx_id)
       VALUES ($1, 'x', $2, $3, $4, '{}', $5::jsonb, $6, $8, $7)`,
      [
        s.occurredAt,
        s.table,
        s.entityId ?? "e1",
        s.op ?? "insert",
        s.rowNew ? JSON.stringify(s.rowNew) : null,
        s.actorUserId ?? null,
        s.txId ?? 1,
        s.origin ?? "http",
      ]
    )
  }

  async function insertUser(id: string, name: string): Promise<void> {
    await pool.query(
      "INSERT INTO identity.users (id, name, email) VALUES ($1, $2, $3)",
      [id, name, `${id}@test.local`]
    )
  }

  const base = { page: 1, pageSize: 20 } as const

  it("filtra por tables (lista de tabelas do agregado)", async () => {
    await seed({ occurredAt: new Date(), table: "services" })
    await seed({ occurredAt: new Date(), table: "service_rooms" })
    await seed({ occurredAt: new Date(), table: "areas" })
    const res = await repo.list({ ...base, tables: ["services", "service_rooms"] })
    expect(res.page.total).toBe(2)
    expect(res.data.map((r) => r.tableName).sort()).toEqual([
      "service_rooms",
      "services",
    ])
  })

  it("filtra por origin user (só http) e system (não-http)", async () => {
    await seed({ occurredAt: new Date(), table: "services", entityId: "u", origin: "http" })
    await seed({ occurredAt: new Date(), table: "services", entityId: "s1", origin: "unknown" })
    await seed({ occurredAt: new Date(), table: "services", entityId: "s2", origin: "event" })

    const user = await repo.list({ ...base, origin: "user" })
    expect(user.data.map((r) => r.entityId)).toEqual(["u"])

    const system = await repo.list({ ...base, origin: "system" })
    expect(system.data.map((r) => r.entityId).sort()).toEqual(["s1", "s2"])
  })

  it("filtra por op", async () => {
    await seed({ occurredAt: new Date(), table: "services", op: "insert" })
    await seed({ occurredAt: new Date(), table: "services", op: "update" })
    const res = await repo.list({ ...base, tables: ["services"], op: "update" })
    expect(res.page.total).toBe(1)
    expect(res.data[0]?.op).toBe("update")
  })

  it("filtra por actorUserId", async () => {
    await seed({ occurredAt: new Date(), table: "services", actorUserId: "u1" })
    await seed({ occurredAt: new Date(), table: "services", actorUserId: "u2" })
    const res = await repo.list({ ...base, actorUserId: "u1" })
    expect(res.page.total).toBe(1)
    expect(res.data[0]?.actorUserId).toBe("u1")
  })

  it("filtra por janela from/to (occurred_at)", async () => {
    await seed({ occurredAt: new Date("2026-01-01T00:00:00Z"), table: "services", entityId: "old" })
    await seed({ occurredAt: new Date("2026-06-01T00:00:00Z"), table: "services", entityId: "mid" })
    await seed({ occurredAt: new Date("2026-12-01T00:00:00Z"), table: "services", entityId: "new" })
    const res = await repo.list({
      ...base,
      from: "2026-03-01T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
    })
    expect(res.data.map((r) => r.entityId)).toEqual(["mid"])
  })

  it("filtra por txId", async () => {
    await seed({ occurredAt: new Date(), table: "services", txId: 100 })
    await seed({ occurredAt: new Date(), table: "services", txId: 200 })
    const res = await repo.list({ ...base, txId: 200 })
    expect(res.page.total).toBe(1)
    expect(res.data[0]?.txId).toBe(200)
  })

  it("ordena por occurred_at desc com desempate estável por seq", async () => {
    const sameMoment = new Date("2026-05-05T10:00:00Z")
    await seed({ occurredAt: new Date("2026-05-04T10:00:00Z"), table: "services", entityId: "older" })
    await seed({ occurredAt: sameMoment, table: "services", entityId: "tieA" })
    await seed({ occurredAt: sameMoment, table: "services", entityId: "tieB" })
    const res = await repo.list({ ...base, tables: ["services"] })
    // sameMoment antes do older; entre os empatados, seq maior (tieB, inserido depois) primeiro.
    expect(res.data.map((r) => r.entityId)).toEqual(["tieB", "tieA", "older"])
  })

  it("pagina por offset", async () => {
    for (let i = 0; i < 5; i++) {
      await seed({
        occurredAt: new Date(`2026-01-0${String(i + 1)}T00:00:00Z`),
        table: "services",
        entityId: `e${String(i)}`,
      })
    }
    const page1 = await repo.list({ page: 1, pageSize: 2, tables: ["services"] })
    const page2 = await repo.list({ page: 2, pageSize: 2, tables: ["services"] })
    expect(page1.page.total).toBe(5)
    expect(page1.page.totalPages).toBe(3)
    expect(page1.data).toHaveLength(2)
    expect(page2.data).toHaveLength(2)
    expect(page1.data[0]?.entityId).toBe("e4")
  })

  it("q busca pelo nome do ator (resolvido via UserDirectoryFacade)", async () => {
    await insertUser("u-ana", "Ana Silva")
    await insertUser("u-bob", "Bob Souza")
    await seed({ occurredAt: new Date(), table: "services", entityId: "a", actorUserId: "u-ana" })
    await seed({ occurredAt: new Date(), table: "services", entityId: "b", actorUserId: "u-bob" })

    const res = await repo.list({ ...base, tables: ["services"], q: "ana" })
    expect(res.data.map((r) => r.entityId)).toEqual(["a"])
  })

  it("q busca no conteúdo das alterações (row_new)", async () => {
    await seed({ occurredAt: new Date(), table: "services", entityId: "x", rowNew: { name: "Massoterapia" } })
    await seed({ occurredAt: new Date(), table: "services", entityId: "y", rowNew: { name: "Fisioterapia" } })

    const res = await repo.list({ ...base, tables: ["services"], q: "massot" })
    expect(res.data.map((r) => r.entityId)).toEqual(["x"])
  })

  it("q casa por entity_id, ator OU alterações (OR)", async () => {
    await insertUser("u-ana", "Ana Silva")
    await seed({ occurredAt: new Date(), table: "services", entityId: "ana-por-ator", actorUserId: "u-ana" })
    await seed({ occurredAt: new Date(), table: "services", entityId: "ana-no-id" })
    await seed({ occurredAt: new Date(), table: "services", entityId: "z", rowNew: { note: "ana no conteúdo" } })
    await seed({ occurredAt: new Date(), table: "services", entityId: "outro" })

    const res = await repo.list({ ...base, tables: ["services"], q: "ana" })
    expect(res.page.total).toBe(3)
    expect(res.data.map((r) => r.entityId).sort()).toEqual([
      "ana-no-id",
      "ana-por-ator",
      "z",
    ])
  })
})

import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import { DrizzleUsageStatsReader } from "./drizzle-usage-stats.reader"

import type { Pool } from "pg"

function saoPaulo(local: string): Date {
  return new Date(`${local}-03:00`)
}

describe("DrizzleUsageStatsReader (int)", () => {
  let pool: Pool
  let reader: DrizzleUsageStatsReader

  const window = {
    from: saoPaulo("2026-03-01T00:00:00"),
    to: saoPaulo("2026-03-11T00:00:00"),
    unit: "day" as const,
  }

  async function insertUser(
    name: string,
    overrides: { createdAt?: string; deletedAt?: string } = {}
  ): Promise<string> {
    const id = ulid()
    await pool.query(
      `INSERT INTO identity.users (id, name, email, access_profile, status, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, 'admin', 'active', $4, now(), $5)`,
      [
        id,
        name,
        `${id}@test.local`,
        overrides.createdAt ?? "2026-01-01T12:00:00-03:00",
        overrides.deletedAt ?? null,
      ]
    )
    return id
  }

  async function insertAuthEvent(
    userId: string | null,
    eventType: string,
    at: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO identity.auth_events (id, user_id, event_type, correlation_id, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [ulid(), userId, eventType, ulid(), at]
    )
  }

  async function insertSession(userId: string, lastSeenAt: string): Promise<void> {
    await pool.query(
      `INSERT INTO identity.sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, now(), $4, now() + interval '30 days')`,
      [ulid(), userId, ulid(), lastSeenAt]
    )
  }

  beforeAll(() => {
    pool = createTestPool()
    reader = new DrizzleUsageStatsReader(
      new TransactionManager(createTestDb(pool), makeTestLogger().loggerFactory)
    )
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  describe("countLoginsByBucket", () => {
    it("soma as entradas por dia no fuso de Brasília", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-03-05T09:00:00-03:00")
      await insertAuthEvent(userId, "login_success", "2026-03-05T18:30:00-03:00")
      await insertAuthEvent(userId, "login_success", "2026-03-06T08:00:00-03:00")

      const rows = await reader.countLoginsByBucket(window)

      expect(rows).toEqual(
        expect.arrayContaining([
          { bucket: saoPaulo("2026-03-05T00:00:00"), count: 2 },
          { bucket: saoPaulo("2026-03-06T00:00:00"), count: 1 },
        ])
      )
      expect(rows).toHaveLength(2)
    })

    it("entrada às 23h fica no dia local, não no dia seguinte", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-03-05T23:30:00-03:00")

      const rows = await reader.countLoginsByBucket(window)

      expect(rows).toEqual([
        { bucket: saoPaulo("2026-03-05T00:00:00"), count: 1 },
      ])
    })

    it("conta só entrada bem-sucedida — falha, bloqueio e saída ficam de fora", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-03-05T09:00:00-03:00")
      await insertAuthEvent(userId, "login_failed", "2026-03-05T09:01:00-03:00")
      await insertAuthEvent(userId, "account_locked", "2026-03-05T09:02:00-03:00")
      await insertAuthEvent(userId, "logout", "2026-03-05T17:00:00-03:00")

      const rows = await reader.countLoginsByBucket(window)

      expect(rows).toEqual([
        { bucket: saoPaulo("2026-03-05T00:00:00"), count: 1 },
      ])
    })

    it("ignora entrada fora da janela pedida", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-02-27T09:00:00-03:00")
      await insertAuthEvent(userId, "login_success", "2026-03-11T09:00:00-03:00")

      expect(await reader.countLoginsByBucket(window)).toEqual([])
    })

    it("agrega por semana quando a unidade é semana", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-03-03T09:00:00-03:00")
      await insertAuthEvent(userId, "login_success", "2026-03-08T09:00:00-03:00")

      const rows = await reader.countLoginsByBucket({ ...window, unit: "week" })

      expect(rows).toEqual([
        { bucket: saoPaulo("2026-03-02T00:00:00"), count: 2 },
      ])
    })
  })

  describe("listUserInactivity", () => {
    it("usa a sessão mais recente como último acesso", async () => {
      const userId = await insertUser("Recepção")
      await insertSession(userId, "2026-03-01T10:00:00-03:00")
      await insertSession(userId, "2026-03-09T15:00:00-03:00")

      const [row] = await reader.listUserInactivity()

      expect(row!.lastAccessAt).toEqual(saoPaulo("2026-03-09T15:00:00"))
    })

    it("sem sessão, cai na última entrada registrada na trilha", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-02-10T08:00:00-03:00")
      await insertAuthEvent(userId, "login_success", "2026-02-20T08:00:00-03:00")

      const [row] = await reader.listUserInactivity()

      expect(row!.lastAccessAt).toEqual(saoPaulo("2026-02-20T08:00:00"))
    })

    it("sessão viva vence a entrada antiga da trilha", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_success", "2026-02-10T08:00:00-03:00")
      await insertSession(userId, "2026-03-09T15:00:00-03:00")

      const [row] = await reader.listUserInactivity()

      expect(row!.lastAccessAt).toEqual(saoPaulo("2026-03-09T15:00:00"))
    })

    it("entrada da trilha mais recente que a sessão vence a sessão", async () => {
      const userId = await insertUser("Recepção")
      await insertSession(userId, "2026-02-01T10:00:00-03:00")
      await insertAuthEvent(userId, "login_success", "2026-03-09T08:00:00-03:00")

      const [row] = await reader.listUserInactivity()

      expect(row!.lastAccessAt).toEqual(saoPaulo("2026-03-09T08:00:00"))
    })

    it("quem nunca acessou vem com último acesso nulo e a data de criação", async () => {
      await insertUser("Convidado novo", { createdAt: "2026-03-08T09:00:00-03:00" })

      const [row] = await reader.listUserInactivity()

      expect(row!.lastAccessAt).toBeNull()
      expect(row!.createdAt).toEqual(saoPaulo("2026-03-08T09:00:00"))
    })

    it("entrada que falhou não conta como acesso", async () => {
      const userId = await insertUser("Recepção")
      await insertAuthEvent(userId, "login_failed", "2026-03-09T08:00:00-03:00")

      const [row] = await reader.listUserInactivity()

      expect(row!.lastAccessAt).toBeNull()
    })

    it("colaborador excluído fica fora da lista", async () => {
      await insertUser("Saiu da empresa", { deletedAt: "2026-03-01T10:00:00-03:00" })
      await insertUser("Continua")

      const rows = await reader.listUserInactivity()

      expect(rows.map((row) => row.name)).toEqual(["Continua"])
    })

    it("devolve nome e perfil de acesso do colaborador", async () => {
      await insertUser("Ana Recepção")

      const [row] = await reader.listUserInactivity()

      expect(row!.name).toBe("Ana Recepção")
      expect(row!.accessProfile).toBe("admin")
    })
  })
})

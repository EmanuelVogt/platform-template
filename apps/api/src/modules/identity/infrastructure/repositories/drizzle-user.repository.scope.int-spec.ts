import { ulid } from "ulid"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import { DrizzleUserRepository } from "./drizzle-user.repository"

import type { Pool } from "pg"

describe("DrizzleUserRepository — escopo profissional (int)", () => {
  let pool: Pool
  let userRepo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    userRepo = new DrizzleUserRepository(
      new TransactionManager(db, makeTestLogger().loggerFactory)
    )
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedUser(): Promise<string> {
    const id = ulid()
    await pool.query(
      `INSERT INTO identity.users
         (id, name, email, access_profile, attends_guests, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'professional', true, 'active', now(), now())`,
      [id, `User ${id}`, `${id}@test.local`]
    )
    return id
  }

  async function seedServiceLink(
    userId: string,
    serviceId: string,
    isDefault = false
  ) {
    await pool.query(
      `INSERT INTO identity.user_professional_services (user_id, service_id, is_default)
       VALUES ($1, $2, $3)`,
      [userId, serviceId, isDefault]
    )
  }

  describe("replaceProfessionalServices", () => {
    it("preserva is_default dos serviços mantidos e zera nos novos", async () => {
      const u1 = await seedUser()
      await seedServiceLink(u1, "svc-mantido", true)
      await seedServiceLink(u1, "svc-removido", true)

      await userRepo.replaceProfessionalServices(u1, [
        "svc-mantido",
        "svc-novo",
      ])

      const rows = await pool.query(
        `SELECT service_id, is_default FROM identity.user_professional_services
         WHERE user_id = $1 ORDER BY service_id`,
        [u1]
      )
      expect(rows.rows).toEqual([
        { service_id: "svc-mantido", is_default: true },
        { service_id: "svc-novo", is_default: false },
      ])
    })

    it("lista vazia limpa a tabela do usuário", async () => {
      const u1 = await seedUser()
      await seedServiceLink(u1, "svc-1", true)
      await userRepo.replaceProfessionalServices(u1, [])
      const rows = await pool.query(
        `SELECT 1 FROM identity.user_professional_services WHERE user_id = $1`,
        [u1]
      )
      expect(rows.rowCount).toBe(0)
    })
  })

  describe("replaceSchedulingAreas", () => {
    it("substitui o conjunto inteiro de áreas de agendamento", async () => {
      const u1 = await seedUser()
      await userRepo.replaceSchedulingAreas(u1, ["area-1", "area-2"])
      await userRepo.replaceSchedulingAreas(u1, ["area-2", "area-3"])
      const rows = await pool.query(
        `SELECT area_id FROM identity.user_scheduling_areas
         WHERE user_id = $1 ORDER BY area_id`,
        [u1]
      )
      expect(rows.rows.map((r: { area_id: string }) => r.area_id)).toEqual([
        "area-2",
        "area-3",
      ])
    })

    it("lista vazia limpa a tabela do usuário", async () => {
      const u1 = await seedUser()
      await userRepo.replaceSchedulingAreas(u1, ["area-1"])
      await userRepo.replaceSchedulingAreas(u1, [])
      const rows = await pool.query(
        `SELECT 1 FROM identity.user_scheduling_areas WHERE user_id = $1`,
        [u1]
      )
      expect(rows.rowCount).toBe(0)
    })

    it("não toca as áreas de atuação do Profissional (relações independentes)", async () => {
      const u1 = await seedUser()
      await userRepo.replaceProfessionalAreas(u1, ["area-pro"])
      await userRepo.replaceSchedulingAreas(u1, ["area-sched"])
      await userRepo.replaceSchedulingAreas(u1, [])
      const rows = await pool.query(
        `SELECT area_id FROM identity.user_professional_areas WHERE user_id = $1`,
        [u1]
      )
      expect(rows.rows.map((r: { area_id: string }) => r.area_id)).toEqual([
        "area-pro",
      ])
    })
  })

  describe("list — schedulingAreaIds", () => {
    it("devolve as áreas de agendamento na linha da listagem", async () => {
      const u1 = await seedUser()
      await userRepo.replaceSchedulingAreas(u1, ["area-1", "area-2"])
      const { data } = await userRepo.list({ page: 1, pageSize: 10 })
      const row = data.find((r) => r.user.props.id === u1)
      expect(row?.schedulingAreaIds.slice().sort()).toEqual([
        "area-1",
        "area-2",
      ])
    })
  })
})

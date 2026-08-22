import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import { DrizzleProfessionalAssignmentRepository } from "./drizzle-professional-assignment.repository"

import type { Pool } from "pg"

describe("DrizzleProfessionalAssignmentRepository (int)", () => {
  let pool: Pool
  let repo: DrizzleProfessionalAssignmentRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    repo = new DrizzleProfessionalAssignmentRepository(
      new TransactionManager(db, makeTestLogger().loggerFactory)
    )
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedUser(
    opts: {
      accessProfile?: "professional" | "admin"
      status?: "active" | "pending"
      deletedAt?: Date | null
      name?: string
    } = {}
  ): Promise<string> {
    const id = ulid()
    await pool.query(
      `INSERT INTO identity.users
         (id, name, email, access_profile, serves_clients, status, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
      [
        id,
        opts.name ?? `User ${id}`,
        `${id}@test.local`,
        opts.accessProfile ?? "professional",
        (opts.accessProfile ?? "professional") === "professional",
        opts.status ?? "active",
        opts.deletedAt ?? null,
      ]
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

  async function seedAreaLink(userId: string, areaId: string) {
    await pool.query(
      `INSERT INTO identity.user_professional_areas (user_id, area_id) VALUES ($1, $2)`,
      [userId, areaId]
    )
  }

  describe("listByServiceIds", () => {
    it("agrupa vínculos por serviço com isDefault, na ordem do vínculo", async () => {
      const u1 = await seedUser({ name: "Ana" })
      const u2 = await seedUser({ name: "Bia" })
      await seedServiceLink(u1, "svc-1", true)
      await seedServiceLink(u2, "svc-1", false)
      await seedServiceLink(u1, "svc-2", false)

      const map = await repo.listByServiceIds(["svc-1", "svc-2"])
      expect(map.get("svc-1")).toEqual([
        { userId: u1, isDefault: true },
        { userId: u2, isDefault: false },
      ])
      expect(map.get("svc-2")).toEqual([{ userId: u1, isDefault: false }])
    })

    it("retorna Map vazio para lista vazia", async () => {
      expect((await repo.listByServiceIds([])).size).toBe(0)
    })
  })

  describe("listServiceIdsByProfessional", () => {
    it("retorna os serviços vinculados do usuário", async () => {
      const u1 = await seedUser()
      await seedServiceLink(u1, "svc-1")
      await seedServiceLink(u1, "svc-2")
      expect((await repo.listServiceIdsByProfessional(u1)).sort()).toEqual([
        "svc-1",
        "svc-2",
      ])
    })
  })

  describe("listUserIdsMissingArea", () => {
    it("retorna só quem NÃO tem a área", async () => {
      const comArea = await seedUser()
      const semArea = await seedUser()
      await seedAreaLink(comArea, "area-1")
      expect(
        await repo.listUserIdsMissingArea("area-1", [comArea, semArea])
      ).toEqual([semArea])
    })

    it("retorna vazio para set vazio", async () => {
      expect(await repo.listUserIdsMissingArea("area-1", [])).toEqual([])
    })
  })

  describe("ensureAreaForServiceProfessionals", () => {
    it("atribui a área uma vez para profissionais distintos dos serviços informados", async () => {
      const shared = await seedUser()
      const onlyFirst = await seedUser()
      const onlySecond = await seedUser()
      await seedServiceLink(shared, "svc-1", true)
      await seedServiceLink(onlyFirst, "svc-1")
      await seedServiceLink(shared, "svc-2", true)
      await seedServiceLink(onlySecond, "svc-2")
      await seedAreaLink(shared, "area-target")

      await repo.ensureAreaForServiceProfessionals({
        areaId: "area-target",
        serviceIds: ["svc-1", "svc-2", "svc-1"],
      })

      const areas = await pool.query<{ user_id: string }>(
        `SELECT user_id
           FROM identity.user_professional_areas
          WHERE area_id = 'area-target'
          ORDER BY user_id`
      )
      expect(areas.rows.map((row) => row.user_id)).toEqual(
        [shared, onlyFirst, onlySecond].sort()
      )
      expect(await repo.listByServiceIds(["svc-1", "svc-2"])).toEqual(
        new Map([
          [
            "svc-1",
            [
              { userId: shared, isDefault: true },
              { userId: onlyFirst, isDefault: false },
            ],
          ],
          [
            "svc-2",
            [
              { userId: shared, isDefault: true },
              { userId: onlySecond, isDefault: false },
            ],
          ],
        ])
      )
    })

    it("não escreve para uma lista de serviços vazia", async () => {
      const userId = await seedUser()

      await repo.ensureAreaForServiceProfessionals({
        areaId: "area-target",
        serviceIds: [],
      })

      expect(
        await repo.listUserIdsMissingArea("area-target", [userId])
      ).toEqual([userId])
    })
  })

  describe("searchAssignable / findAssignableByIds", () => {
    it("filtra professional+active+vivo (paridade com o diretório)", async () => {
      const pro = await seedUser({ name: "Ana" })
      await seedUser({ accessProfile: "admin", name: "Admin" })
      await seedUser({ status: "pending", name: "Pendente" })
      await seedUser({ deletedAt: new Date(), name: "Deletado" })

      const page = await repo.searchAssignable({ page: 1, pageSize: 20 })
      expect(page.data.map((p) => p.id)).toEqual([pro])

      const byIds = await repo.findAssignableByIds([pro, "ghost"])
      expect([...byIds.keys()]).toEqual([pro])
    })
  })

  describe("replaceForService", () => {
    it("insere vínculos novos com isDefault e auto-atribui a área ausente", async () => {
      const u1 = await seedUser()
      const u2 = await seedUser()
      await seedAreaLink(u1, "area-1")

      await repo.replaceForService({
        serviceId: "svc-1",
        areaId: "area-1",
        links: [
          { userId: u1, isDefault: true },
          { userId: u2, isDefault: false },
        ],
      })

      const map = await repo.listByServiceIds(["svc-1"])
      expect(map.get("svc-1")).toEqual([
        { userId: u1, isDefault: true },
        { userId: u2, isDefault: false },
      ])
      expect(await repo.listUserIdsMissingArea("area-1", [u1, u2])).toEqual([])
      const areas = await pool.query(
        `SELECT user_id FROM identity.user_professional_areas WHERE area_id = 'area-1' AND user_id = $1`,
        [u1]
      )
      expect(areas.rowCount).toBe(1)
    })

    it("remove quem saiu do set e atualiza isDefault de quem ficou", async () => {
      const fica = await seedUser()
      const sai = await seedUser()
      await seedServiceLink(fica, "svc-1", false)
      await seedServiceLink(sai, "svc-1", true)

      await repo.replaceForService({
        serviceId: "svc-1",
        areaId: "area-1",
        links: [{ userId: fica, isDefault: true }],
      })

      const map = await repo.listByServiceIds(["svc-1"])
      expect(map.get("svc-1")).toEqual([{ userId: fica, isDefault: true }])
    })

    it("set vazio limpa os vínculos do serviço sem tocar em áreas", async () => {
      const u1 = await seedUser()
      await seedServiceLink(u1, "svc-1")
      await seedAreaLink(u1, "area-1")

      await repo.replaceForService({
        serviceId: "svc-1",
        areaId: "area-1",
        links: [],
      })

      expect((await repo.listByServiceIds(["svc-1"])).size).toBe(0)
      expect(await repo.listUserIdsMissingArea("area-1", [u1])).toEqual([])
    })

    it("não toca vínculos de OUTROS serviços do mesmo usuário", async () => {
      const u1 = await seedUser()
      await seedServiceLink(u1, "svc-1")
      await seedServiceLink(u1, "svc-2", true)

      await repo.replaceForService({
        serviceId: "svc-1",
        areaId: "area-1",
        links: [],
      })

      const map = await repo.listByServiceIds(["svc-2"])
      expect(map.get("svc-2")).toEqual([{ userId: u1, isDefault: true }])
    })
  })

  describe("removeByServiceIds", () => {
    it("apaga os vínculos dos serviços informados", async () => {
      const u1 = await seedUser()
      await seedServiceLink(u1, "svc-1")
      await seedServiceLink(u1, "svc-2")

      await repo.removeByServiceIds(["svc-1"])

      expect((await repo.listByServiceIds(["svc-1"])).size).toBe(0)
      expect((await repo.listByServiceIds(["svc-2"])).size).toBe(1)
    })

    it("lista vazia é no-op", async () => {
      await expect(repo.removeByServiceIds([])).resolves.toBeUndefined()
    })
  })
})

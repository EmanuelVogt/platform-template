import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { ProfessionalDirectoryFacade } from "../../api/facades/professional-directory.facade"

import { DrizzleUserRepository } from "./drizzle-user.repository"

import type { Pool } from "pg"

describe("ProfessionalDirectoryFacade (int)", () => {
  let pool: Pool
  let facade: ProfessionalDirectoryFacade

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    facade = new ProfessionalDirectoryFacade(new DrizzleUserRepository(txm))
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  // servesClients default = perfil professional: espelha o backfill da migration
  // 0131, então os casos que não falam de atendimento seguem valendo.
  async function seedUser(opts: {
    id?: string
    accessProfile: "professional" | "admin" | "master"
    servesClients?: boolean
    status?: "active" | "pending"
    deletedAt?: Date | null
    name?: string
  }): Promise<string> {
    const id = opts.id ?? ulid()
    const email = `${id}@test.local`
    await pool.query(
      `INSERT INTO identity.users
         (id, name, email, access_profile, serves_clients, status, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
      [
        id,
        opts.name ?? `User ${id}`,
        email,
        opts.accessProfile,
        opts.servesClients ?? opts.accessProfile === "professional",
        opts.status ?? "active",
        opts.deletedAt ?? null,
      ]
    )
    return id
  }

  describe("critério de atendimento (ADR 0082)", () => {
    it("perfil não-profissional marcado é profissional atribuível", async () => {
      const id = await seedUser({
        accessProfile: "admin",
        servesClients: true,
        name: "Admin Que Atende",
      })
      expect(await facade.isActiveProfessional(id)).toBe(true)
      expect((await facade.listActive()).map((p) => p.id)).toContain(id)
      expect((await facade.findByIds([id])).has(id)).toBe(true)
    })

    it("perfil Profissional sem a marcação fica fora", async () => {
      const id = await seedUser({
        accessProfile: "professional",
        servesClients: false,
        name: "Profissional Sem Escala",
      })
      expect(await facade.isActiveProfessional(id)).toBe(false)
      expect((await facade.listActive()).map((p) => p.id)).not.toContain(id)
      expect((await facade.findByIds([id])).has(id)).toBe(false)
    })
  })

  describe("isActiveProfessional", () => {
    it("retorna true para professional ativo e vivo", async () => {
      const id = await seedUser({ accessProfile: "professional" })
      expect(await facade.isActiveProfessional(id)).toBe(true)
    })

    it("retorna false para admin ativo", async () => {
      const id = await seedUser({ accessProfile: "admin" })
      expect(await facade.isActiveProfessional(id)).toBe(false)
    })

    it("retorna false para professional com status pending", async () => {
      const id = await seedUser({
        accessProfile: "professional",
        status: "pending",
      })
      expect(await facade.isActiveProfessional(id)).toBe(false)
    })

    it("retorna false para professional soft-deleted", async () => {
      const id = await seedUser({
        accessProfile: "professional",
        deletedAt: new Date(),
      })
      expect(await facade.isActiveProfessional(id)).toBe(false)
    })

    it("retorna false para id inexistente", async () => {
      expect(await facade.isActiveProfessional("nao-existe")).toBe(false)
    })
  })

  describe("searchAssignable", () => {
    it("lista só professionals ativos, paginado", async () => {
      await seedUser({ accessProfile: "professional", name: "Zara" })
      await seedUser({ accessProfile: "professional", name: "Ana" })
      await seedUser({ accessProfile: "admin", name: "Admin" })
      await seedUser({
        accessProfile: "professional",
        status: "pending",
        name: "Pending",
      })

      const result = await facade.searchAssignable({ page: 1, pageSize: 20 })
      expect(result.data.map((p) => p.name)).toEqual(["Ana", "Zara"])
      expect(result.page.total).toBe(2)
    })

    it("exclui professionals soft-deleted", async () => {
      await seedUser({ accessProfile: "professional", name: "Ativo" })
      await seedUser({
        accessProfile: "professional",
        name: "Deletado",
        deletedAt: new Date(),
      })

      const result = await facade.searchAssignable({ page: 1, pageSize: 20 })
      expect(result.data).toHaveLength(1)
      expect(result.data[0]?.name).toBe("Ativo")
    })

    it("retorna email e avatarAttachmentId nos itens", async () => {
      const id = await seedUser({
        accessProfile: "professional",
        name: "Dr. Campos",
      })

      const result = await facade.searchAssignable({ page: 1, pageSize: 20 })
      const item = result.data.find((p) => p.id === id)
      expect(item).toBeDefined()
      expect(item?.email).toBe(`${id}@test.local`)
      expect(item?.avatarAttachmentId).toBeNull()
    })

    it("q filtra por nome", async () => {
      await seedUser({ accessProfile: "professional", name: "Dr. House" })
      await seedUser({ accessProfile: "professional", name: "Dra. Grey" })

      const result = await facade.searchAssignable({
        page: 1,
        pageSize: 20,
        q: "house",
      })
      expect(result.data).toHaveLength(1)
      expect(result.data[0]?.name).toBe("Dr. House")
    })

    it("q filtra por email", async () => {
      const id = await seedUser({
        accessProfile: "professional",
        name: "Filtrado Por Email",
      })
      await seedUser({
        accessProfile: "professional",
        name: "Outro Professional",
      })

      const result = await facade.searchAssignable({
        page: 1,
        pageSize: 20,
        q: `${id}@`,
      })
      expect(result.data).toHaveLength(1)
      expect(result.data[0]?.id).toBe(id)
    })
  })

  describe("findByIds", () => {
    it("mapeia ids → {id, name, email, avatarAttachmentId} filtrando só professionals ativos", async () => {
      const profId = await seedUser({
        accessProfile: "professional",
        name: "Dr. João",
      })
      const adminId = await seedUser({ accessProfile: "admin", name: "Admin" })

      const map = await facade.findByIds([profId, adminId])
      expect(map.get(profId)).toEqual({
        id: profId,
        name: "Dr. João",
        email: `${profId}@test.local`,
        avatarAttachmentId: null,
      })
      expect(map.has(adminId)).toBe(false)
    })

    it("exclui professionals inativos e deletados (órfãos)", async () => {
      const activeId = await seedUser({ accessProfile: "professional" })
      const pendingId = await seedUser({
        accessProfile: "professional",
        status: "pending",
      })
      const deletedId = await seedUser({
        accessProfile: "professional",
        deletedAt: new Date(),
      })

      const map = await facade.findByIds([activeId, pendingId, deletedId])
      expect(map.has(activeId)).toBe(true)
      expect(map.has(pendingId)).toBe(false)
      expect(map.has(deletedId)).toBe(false)
    })

    it("ids inexistentes não aparecem no mapa", async () => {
      const map = await facade.findByIds(["nao-existe"])
      expect(map.size).toBe(0)
    })

    it("lista vazia → mapa vazio sem query", async () => {
      const map = await facade.findByIds([])
      expect(map.size).toBe(0)
    })
  })

  describe("listActive", () => {
    it("lista só profissional ativo e visível, ordenado por nome", async () => {
      await seedUser({ accessProfile: "professional", name: "Bruna" })
      await seedUser({ accessProfile: "professional", name: "Alice" })
      await seedUser({
        accessProfile: "professional",
        status: "pending",
        name: "Pendente",
      })
      await seedUser({ accessProfile: "admin", name: "Admin" })
      await seedUser({
        accessProfile: "professional",
        name: "Deletada",
        deletedAt: new Date(),
      })

      const result = await facade.listActive()
      expect(result.map((p) => p.name)).toEqual(["Alice", "Bruna"])
    })

    it("retorna email e avatarAttachmentId nos refs", async () => {
      const id = await seedUser({
        accessProfile: "professional",
        name: "Dr. Campos",
      })

      const result = await facade.listActive()
      expect(result).toEqual([
        {
          id,
          name: "Dr. Campos",
          email: `${id}@test.local`,
          avatarAttachmentId: null,
        },
      ])
    })
  })

  describe("listActiveByArea", () => {
    it("lista só profissionais ativos vinculados à área, ordenados por nome", async () => {
      const alice = await seedUser({
        accessProfile: "professional",
        name: "Alice",
      })
      const bruna = await seedUser({
        accessProfile: "professional",
        name: "Bruna",
      })
      await seedUser({ accessProfile: "professional", name: "Carla" })
      await seedAreaLink(alice, "area-spa")
      await seedAreaLink(bruna, "area-spa")
      await seedAreaLink(bruna, "area-outro")

      const result = await facade.listActiveByArea("area-spa")
      expect(result.map((p) => p.name)).toEqual(["Alice", "Bruna"])
    })

    it("exclui inativos, deletados e quem não tem a área", async () => {
      const active = await seedUser({
        accessProfile: "professional",
        name: "Ativo",
      })
      const pending = await seedUser({
        accessProfile: "professional",
        status: "pending",
        name: "Pendente",
      })
      const deleted = await seedUser({
        accessProfile: "professional",
        name: "Deletado",
        deletedAt: new Date(),
      })
      await seedAreaLink(active, "area-spa")
      await seedAreaLink(pending, "area-spa")
      await seedAreaLink(deleted, "area-spa")

      const result = await facade.listActiveByArea("area-spa")
      expect(result.map((p) => p.id)).toEqual([active])
    })
  })

  async function seedAreaLink(userId: string, areaId: string): Promise<void> {
    await pool.query(
      `INSERT INTO identity.user_professional_areas (user_id, area_id) VALUES ($1, $2)`,
      [userId, areaId]
    )
  }

  async function seedProfessionalService(
    userId: string,
    serviceId: string,
    isDefault = false
  ): Promise<void> {
    await pool.query(
      `INSERT INTO identity.user_professional_services (user_id, service_id, is_default, created_at)
       VALUES ($1, $2, $3, now())`,
      [userId, serviceId, isDefault]
    )
  }

  describe("findAreaIdsByProfessionalIds", () => {
    it("agrupa áreas por profissional em ordem de usuário e área", async () => {
      const professionalA = await seedUser({
        id: "pro-1",
        accessProfile: "professional",
        name: "Prof A",
      })
      const professionalB = await seedUser({
        id: "pro-2",
        accessProfile: "professional",
        name: "Prof B",
      })
      await seedAreaLink(professionalA, "area-2")
      await seedAreaLink(professionalA, "area-1")
      await seedAreaLink(professionalB, "area-2")

      const areas = await facade.findAreaIdsByProfessionalIds([
        professionalB,
        professionalA,
      ])

      expect(areas).toEqual(
        new Map([
          [professionalA, ["area-1", "area-2"]],
          [professionalB, ["area-2"]],
        ])
      )
    })
  })

  describe("findActiveProfessionalIdsByServices", () => {
    it("retorna só o profissional ativo habilitado pro serviço", async () => {
      const activeId = await seedUser({
        accessProfile: "professional",
        name: "Ativo",
      })
      const pendingId = await seedUser({
        accessProfile: "professional",
        status: "pending",
        name: "Pendente",
      })
      await seedProfessionalService(activeId, "svc-1")
      await seedProfessionalService(pendingId, "svc-1")

      const map = await facade.findActiveProfessionalIdsByServices(["svc-1"])
      expect(map.get("svc-1")).toEqual([activeId])
    })

    it("agrupa por serviceId quando vários serviços são consultados", async () => {
      const profA = await seedUser({
        accessProfile: "professional",
        name: "Prof A",
      })
      const profB = await seedUser({
        accessProfile: "professional",
        name: "Prof B",
      })
      await seedProfessionalService(profA, "svc-1")
      await seedProfessionalService(profB, "svc-2")

      const map = await facade.findActiveProfessionalIdsByServices([
        "svc-1",
        "svc-2",
      ])
      expect(map.get("svc-1")).toEqual([profA])
      expect(map.get("svc-2")).toEqual([profB])
    })

    it("exclui professional soft-deleted", async () => {
      const deletedId = await seedUser({
        accessProfile: "professional",
        deletedAt: new Date(),
      })
      await seedProfessionalService(deletedId, "svc-1")

      const map = await facade.findActiveProfessionalIdsByServices(["svc-1"])
      expect(map.has("svc-1")).toBe(false)
    })

    it("lista vazia → mapa vazio sem query", async () => {
      const map = await facade.findActiveProfessionalIdsByServices([])
      expect(map.size).toBe(0)
    })
  })

  describe("findActiveProfessionalLinksByServices", () => {
    it("devolve a flag de padrão junto do id", async () => {
      const pro = await seedUser({ accessProfile: "professional" })
      const outro = await seedUser({ accessProfile: "professional" })
      await seedProfessionalService(pro, "svc-1", true)
      await seedProfessionalService(outro, "svc-1", false)

      const map = await facade.findActiveProfessionalLinksByServices(["svc-1"])
      expect(map.get("svc-1")).toEqual(
        expect.arrayContaining([
          { userId: pro, isDefault: true },
          { userId: outro, isDefault: false },
        ])
      )
    })

    it("exclui profissional inativo, pendente ou deletado", async () => {
      const vivo = await seedUser({ accessProfile: "professional" })
      const deletado = await seedUser({
        accessProfile: "professional",
        deletedAt: new Date(),
      })
      const pendente = await seedUser({
        accessProfile: "professional",
        status: "pending",
      })
      await seedProfessionalService(vivo, "svc-2", true)
      await seedProfessionalService(deletado, "svc-2", true)
      await seedProfessionalService(pendente, "svc-2", true)

      const map = await facade.findActiveProfessionalLinksByServices(["svc-2"])
      expect(map.get("svc-2")).toEqual([{ userId: vivo, isDefault: true }])
    })

    it("agrupa por serviceId quando vários serviços são consultados", async () => {
      const profA = await seedUser({ accessProfile: "professional" })
      const profB = await seedUser({ accessProfile: "professional" })
      await seedProfessionalService(profA, "svc-1", true)
      await seedProfessionalService(profB, "svc-2", false)

      const map = await facade.findActiveProfessionalLinksByServices([
        "svc-1",
        "svc-2",
      ])
      expect(map.get("svc-1")).toEqual([{ userId: profA, isDefault: true }])
      expect(map.get("svc-2")).toEqual([{ userId: profB, isDefault: false }])
    })

    it("lista vazia devolve Map vazio sem query", async () => {
      const map = await facade.findActiveProfessionalLinksByServices([])
      expect(map.size).toBe(0)
    })
  })
})

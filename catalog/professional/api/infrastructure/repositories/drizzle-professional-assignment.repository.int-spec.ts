import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDb, createTestPool } from "../../../../../test/setup/test-db"
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

  // O truncate desta entrada mora aqui e não no harness do kernel: as tabelas
  // são da entrada e saem com ela. `identity.users` cai junto porque todas as
  // FKs do recorte apontam para lá — o CASCADE limpa o recorte inteiro.
  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        professional.professional_default_hours,
        professional.professional_profile,
        identity.users
      RESTART IDENTITY CASCADE
    `)
  })

  afterAll(async () => {
    await pool.end()
  })

  /**
   * Cria o usuário no identity e, salvo pedido em contrário, o perfil
   * profissional 1:1 que carrega `serves_clients` depois do corte do agregado.
   * O perfil de acesso fica em 'admin' de propósito: atribuível não deriva do
   * access_profile (ADR 0082) e o literal 'professional' saiu do identity.
   */
  async function seedProfessional(
    opts: {
      servesClients?: boolean
      status?: "active" | "pending"
      deletedAt?: Date | null
      name?: string
      withProfile?: boolean
    } = {}
  ): Promise<string> {
    const id = ulid()
    await pool.query(
      `INSERT INTO identity.users
         (id, name, email, access_profile, status, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', $4, $5, now(), now())`,
      [
        id,
        opts.name ?? `User ${id}`,
        `${id}@test.local`,
        opts.status ?? "active",
        opts.deletedAt ?? null,
      ]
    )
    if (opts.withProfile !== false) {
      await pool.query(
        `INSERT INTO professional.professional_profile (user_id, serves_clients)
         VALUES ($1, $2)`,
        [id, opts.servesClients ?? true]
      )
    }
    return id
  }

  async function seedServiceLink(
    userId: string,
    serviceId: string,
    isDefault = false
  ) {
    await pool.query(
      `INSERT INTO professional.user_professional_services (user_id, service_id, is_default)
       VALUES ($1, $2, $3)`,
      [userId, serviceId, isDefault]
    )
  }

  async function seedAreaLink(userId: string, areaId: string) {
    await pool.query(
      `INSERT INTO professional.user_professional_areas (user_id, area_id)
       VALUES ($1, $2)`,
      [userId, areaId]
    )
  }

  it("searchAssignable filtra por serves_clients do perfil, ativo e vivo", async () => {
    const atende = await seedProfessional({ name: "Ana" })
    await seedProfessional({ servesClients: false, name: "Nao atende" })
    await seedProfessional({ status: "pending", name: "Pendente" })
    await seedProfessional({ deletedAt: new Date(), name: "Deletado" })
    await seedProfessional({ withProfile: false, name: "Sem perfil" })

    const page = await repo.searchAssignable({ page: 1, pageSize: 20 })

    expect(page.data.map((p) => p.id)).toEqual([atende])
    expect(page.page.total).toBe(1)
  })

  it("findAssignableByIds aplica o mesmo filtro e ignora id inexistente", async () => {
    const atende = await seedProfessional()
    const naoAtende = await seedProfessional({ servesClients: false })

    const byIds = await repo.findAssignableByIds([atende, naoAtende, "ghost"])

    expect([...byIds.keys()]).toEqual([atende])
    expect(byIds.get(atende)?.avatarAttachmentId).toBeNull()
  })

  it("listByServiceIds agrupa vínculos por serviço com isDefault, na ordem do vínculo", async () => {
    const u1 = await seedProfessional({ name: "Ana" })
    const u2 = await seedProfessional({ name: "Bia" })
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

  it("replaceForService troca o set do serviço e auto-atribui a área ausente", async () => {
    const fica = await seedProfessional()
    const entra = await seedProfessional()
    const sai = await seedProfessional()
    await seedAreaLink(fica, "area-1")
    await seedServiceLink(fica, "svc-1", false)
    await seedServiceLink(sai, "svc-1", true)

    await repo.replaceForService({
      serviceId: "svc-1",
      areaId: "area-1",
      links: [
        { userId: fica, isDefault: true },
        { userId: entra, isDefault: false },
      ],
    })

    const map = await repo.listByServiceIds(["svc-1"])
    expect(map.get("svc-1")).toEqual([
      { userId: fica, isDefault: true },
      { userId: entra, isDefault: false },
    ])
    expect(
      await repo.listUserIdsMissingArea("area-1", [fica, entra, sai])
    ).toEqual([sai])
    const areas = await pool.query(
      `SELECT user_id FROM professional.user_professional_areas
        WHERE area_id = 'area-1' AND user_id = $1`,
      [fica]
    )
    expect(areas.rowCount).toBe(1)
  })

  it("ensureAreaForServiceProfessionals atribui a área uma vez por profissional distinto", async () => {
    const nosDois = await seedProfessional()
    const soNoPrimeiro = await seedProfessional()
    const foraDosServicos = await seedProfessional()
    await seedServiceLink(nosDois, "svc-1", true)
    await seedServiceLink(nosDois, "svc-2")
    await seedServiceLink(soNoPrimeiro, "svc-1")
    await seedServiceLink(foraDosServicos, "svc-3")

    await repo.ensureAreaForServiceProfessionals({
      areaId: "area-1",
      serviceIds: ["svc-1", "svc-2"],
    })

    const rows = await pool.query(
      `SELECT user_id FROM professional.user_professional_areas WHERE area_id = 'area-1'`
    )
    expect(rows.rowCount).toBe(2)
    expect(
      await repo.listUserIdsMissingArea("area-1", [
        nosDois,
        soNoPrimeiro,
        foraDosServicos,
      ])
    ).toEqual([foraDosServicos])
  })
})

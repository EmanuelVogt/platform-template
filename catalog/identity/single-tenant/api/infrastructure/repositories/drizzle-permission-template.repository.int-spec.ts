import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { PermissionTemplate } from "../../domain/entities/permission-template.entity"
import { permissionTemplatePermissions } from "../tables/permission-template.table"

import { DrizzlePermissionTemplateRepository } from "./drizzle-permission-template.repository"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { Pool } from "pg"

const NOW = new Date("2026-06-12T12:00:00.000Z")

function makeTemplate(name: string): PermissionTemplate {
  return PermissionTemplate.create(
    {
      name,
      description: null,
      permissions: ["admin.users.read", "admin.users.create"],
    },
    NOW
  )
}

describe("DrizzlePermissionTemplateRepository (int)", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzlePermissionTemplateRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzlePermissionTemplateRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("insert + findById fazem round-trip com permissões", async () => {
    const template = makeTemplate("Recepção")
    await repo.insert(template)
    const found = await repo.findById(template.props.id)
    expect(found?.props.name).toBe("Recepção")
    expect([...(found?.props.permissions ?? [])].sort()).toEqual([
      "admin.users.create",
      "admin.users.read",
    ])
  })

  it("findByName resolve e null para inexistente", async () => {
    const template = makeTemplate("Gerência")
    await repo.insert(template)
    expect((await repo.findByName("Gerência"))?.props.id).toBe(template.props.id)
    expect(await repo.findByName("Nada")).toBeNull()
  })

  it("update troca o set inteiro (overwrite)", async () => {
    const template = makeTemplate("Recepção")
    await repo.insert(template)
    const updated = template.update(
      {
        name: "Recepção v2",
        description: "nova",
        permissions: ["admin.users.read"],
      },
      new Date("2026-06-13T00:00:00.000Z")
    )
    await repo.update(updated)
    const found = await repo.findById(template.props.id)
    expect(found?.props.name).toBe("Recepção v2")
    expect(found?.props.permissions).toEqual(["admin.users.read"])
  })

  it("listAll ordena por nome", async () => {
    await repo.insert(makeTemplate("Zelador"))
    await repo.insert(makeTemplate("Atendente"))
    const all = await repo.listAll()
    expect(all.map((t) => t.props.name)).toEqual(["Atendente", "Zelador"])
  })

  it("deleteById cascateia as permissões", async () => {
    const template = makeTemplate("Temporário")
    await repo.insert(template)
    await repo.deleteById(template.props.id)
    expect(await repo.findById(template.props.id)).toBeNull()
    const orphans = await db
      .select()
      .from(permissionTemplatePermissions)
    expect(orphans).toEqual([])
  })
})

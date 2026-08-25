import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { resetDb } from "../../../shared/test/int/db"
import { loginAs, seedEmail, seedUser } from "../../identity/testing"
import { detachIdentityTables, reattachIdentityTables } from "../testing"

import type { INestApplication } from "@nestjs/common"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Audit-Muito-Forte-2026!"

const auditorEmail = seedEmail("audit", "auditor")
const noAuditEmail = seedEmail("audit", "no-audit")
const userAuditorEmail = seedEmail("audit", "user-auditor")

type AuditItem = {
  op: "insert" | "update" | "delete"
  entityId: string
  changedKeys: string[]
  changes: Record<string, { old: unknown; new: unknown }>
  actorUserId: string | null
  actorName: string | null
  origin: string
}

describe("Audit log (e2e)", () => {
  const db = withE2ePool()
  let app: INestApplication
  let auditorCookie: string[]
  let noAuditCookie: string[]
  let userAuditorCookie: string[]

  beforeAll(async () => {
    const pool = db.pool
    await resetDb(pool, ["identity", "_kernel"])
    // SPEC_DEVIATION: reanexa as tabelas do identity ao trigger.
    // Reason: mesma causa de audit-trigger.int-spec.ts — a migration custom
    // do identity roda antes de `audit.attach` existir num `catalog:check
    // audit`; simula o passo manual que um produto reaplicaria.
    await reattachIdentityTables(pool)

    app = (await createE2eApp()).app

    // SPEC_DEVIATION: veículo trocado de /v1/admin/tags para
    // /v1/admin/permission-templates. Reason: audit não depende de tag
    // (siblings sob identity) — um `catalog:check audit` standalone nunca
    // instala o módulo tag; permission-templates é CRUD real de identity
    // (dependência declarada) com o mesmo formato (create/update audited).
    await seedUser(app, pool, {
      email: auditorEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: [
        "admin.permission_templates.create",
        "admin.permission_templates.update",
        "admin.permission_templates.read",
        "admin.permission_templates.audit.read",
      ],
    })
    await seedUser(app, pool, {
      email: noAuditEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.permission_templates.read"],
    })
    await seedUser(app, pool, {
      email: userAuditorEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.users.read", "admin.users.audit.read"],
    })

    auditorCookie = await loginAs(
      request(app.getHttpServer()),
      auditorEmail,
      PASSWORD
    )
    noAuditCookie = await loginAs(
      request(app.getHttpServer()),
      noAuditEmail,
      PASSWORD
    )
    userAuditorCookie = await loginAs(
      request(app.getHttpServer()),
      userAuditorEmail,
      PASSWORD
    )
  })

  afterAll(async () => {
    await app.close()
    await detachIdentityTables(db.pool)
  })

  it("reflete create + update do ator no GET /v1/audit", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/admin/permission-templates")
      .set("Origin", ORIGIN)
      .set("Cookie", auditorCookie)
      .set("Idempotency-Key", "audit-e2e-create")
      .send({ name: "Template auditado", permissions: ["admin.users.read"] })
      .expect(201)
    const templateId = created.body.template.id as string

    await request(app.getHttpServer())
      .put(`/v1/admin/permission-templates/${templateId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", auditorCookie)
      .set("Idempotency-Key", "audit-e2e-update")
      .send({
        name: "Template auditado (editado)",
        permissions: ["admin.users.read"],
      })
      .expect(200)

    const res = await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "permission_templates", entityId: templateId })
      .set("Origin", ORIGIN)
      .set("Cookie", auditorCookie)
      .expect(200)

    const items = res.body.data as AuditItem[]
    const insert = items.find((i) => i.op === "insert")
    const update = items.find((i) => i.op === "update")

    expect(insert).toBeDefined()
    expect(insert?.changes.name!.new).toBe("Template auditado")
    // Contexto do ator ponta a ponta: middleware → set_config → trigger → leitura.
    expect(insert?.origin).toBe("http")
    expect(insert?.actorUserId).not.toBeNull()
    expect(typeof insert?.actorName).toBe("string")

    expect(update).toBeDefined()
    expect(update?.changedKeys).toContain("name")
    expect(update?.changes.name).toEqual({
      old: "Template auditado",
      new: "Template auditado (editado)",
      oldLabel: null,
      newLabel: null,
    })
  })

  it("nega leitura sem nenhuma permissão de logs → 403", async () => {
    await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "permission_templates" })
      .set("Origin", ORIGIN)
      .set("Cookie", noAuditCookie)
      .expect(403)
  })

  it("nega tabela fora do escopo do ator → 403", async () => {
    await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "permission_templates" })
      .set("Origin", ORIGIN)
      .set("Cookie", userAuditorCookie)
      .expect(403)
  })

  it("sem filtro de tabela devolve só a união permitida", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/audit")
      .set("Origin", ORIGIN)
      .set("Cookie", userAuditorCookie)
      .expect(200)
    const items = res.body.data as { tableName: string }[]
    const allowed = new Set([
      "users",
      "user_permissions",
      "user_professional_areas",
      "user_professional_services",
      "user_scheduling_areas",
      "user_professional_schedule_configs",
      "user_professional_schedule_config_slots",
      "user_professional_schedule_config_blocks",
      "professional_default_hours",
      "devices",
      "sessions",
      "verification_tokens",
    ])
    for (const item of items) {
      expect(allowed.has(item.tableName)).toBe(true)
    }
  })
})

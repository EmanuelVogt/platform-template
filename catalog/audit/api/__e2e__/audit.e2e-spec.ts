import request from "supertest"

import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import { allowAllRateLimiter, createE2eApp } from "../setup/app-factory"
import { setCookies } from "../setup/cookies"
import { seedUser } from "../setup/seed-user"
import {
  createTestPool,
  seedEmail,
  truncateIdentity,
  truncateKernel,
  truncateTag,
} from "../setup/test-db"

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
  let app: INestApplication
  let auditorCookie: string[]
  let noAuditCookie: string[]
  let userAuditorCookie: string[]

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateTag(pool)

    app = await createE2eApp((b) =>
      b.overrideProvider(RATE_LIMITER).useValue(allowAllRateLimiter)
    )

    await seedUser(app, pool, {
      email: auditorEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: [
        "admin.tags.create",
        "admin.tags.update",
        "admin.tags.read",
        "admin.tags.audit.read",
      ],
    })
    await seedUser(app, pool, {
      email: noAuditEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.tags.read"],
    })
    await seedUser(app, pool, {
      email: userAuditorEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.users.read", "admin.users.audit.read"],
    })
    await pool.end()

    auditorCookie = await login(app, auditorEmail)
    noAuditCookie = await login(app, noAuditEmail)
    userAuditorCookie = await login(app, userAuditorEmail)
  })

  afterAll(async () => {
    await app.close()
  })

  it("reflete create + update do ator no GET /v1/audit", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/admin/tags")
      .set("Origin", ORIGIN)
      .set("Cookie", auditorCookie)
      .send({ name: "Tag auditada" })
      .expect(201)
    const tagId = created.body.id as string

    await request(app.getHttpServer())
      .put(`/v1/admin/tags/${tagId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", auditorCookie)
      .send({ name: "Tag auditada (editada)" })
      .expect(200)

    const res = await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "tags", entityId: tagId })
      .set("Origin", ORIGIN)
      .set("Cookie", auditorCookie)
      .expect(200)

    const items = res.body.data as AuditItem[]
    const insert = items.find((i) => i.op === "insert")
    const update = items.find((i) => i.op === "update")

    expect(insert).toBeDefined()
    expect(insert?.changes.name!.new).toBe("Tag auditada")
    // Contexto do ator ponta a ponta: middleware → set_config → trigger → leitura.
    expect(insert?.origin).toBe("http")
    expect(insert?.actorUserId).not.toBeNull()
    expect(typeof insert?.actorName).toBe("string")

    expect(update).toBeDefined()
    expect(update?.changedKeys).toContain("name")
    expect(update?.changes.name).toEqual({
      old: "Tag auditada",
      new: "Tag auditada (editada)",
      oldLabel: null,
      newLabel: null,
    })
  })

  it("nega leitura sem nenhuma permissão de logs → 403", async () => {
    await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "tags" })
      .set("Origin", ORIGIN)
      .set("Cookie", noAuditCookie)
      .expect(403)
  })

  it("nega tabela fora do escopo do ator → 403", async () => {
    await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "tags" })
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

async function login(
  app: INestApplication,
  email: string
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post("/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: PASSWORD })
    .expect(200)
  return setCookies(res)
}

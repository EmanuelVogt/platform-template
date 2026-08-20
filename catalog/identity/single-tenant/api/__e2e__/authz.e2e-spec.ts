import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RATE_LIMITER } from "../domain/ports/rate-limiter"
import { MAILER } from "../../notification/domain/ports/mailer"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { fakeMailer } from "../testing/fake-mailer"
import { seedUser } from "../testing/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Muito-Forte-AuthZ-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

describe("authz — AuthMiddleware + AccessGuard + validações (e2e)", () => {
  let app: INestApplication
  let pool: Pool
  let masterCookie: string[]
  let readerCookie: string[]
  let nopermCookie: string[]
  let creatorCookie: string[]
  let readerId: string
  let powerfulId: string

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200)
    return res.headers["set-cookie"] as unknown as string[]
  }

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(MAILER)
      .useValue(fakeMailer())
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()

    await seedUser(app, pool, {
      email: "authz-master@example.com",
      password: PASSWORD,
      accessProfile: "master",
    })
    readerId = await seedUser(app, pool, {
      email: "authz-reader@example.com",
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.users.read", "admin.users.update"],
    })
    await seedUser(app, pool, {
      email: "authz-noperm@example.com",
      password: PASSWORD,
      accessProfile: "admin",
    })
    await seedUser(app, pool, {
      email: "authz-creator@example.com",
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.users.read", "admin.users.create", "admin.users.update"],
    })
    powerfulId = await seedUser(app, pool, {
      email: "authz-power@example.com",
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.tags.read"],
    })

    masterCookie = await login("authz-master@example.com")
    readerCookie = await login("authz-reader@example.com")
    nopermCookie = await login("authz-noperm@example.com")
    creatorCookie = await login("authz-creator@example.com")
  })

  afterAll(async () => {
    await pool.end()
    await app.close()
  })

  it("reader acessa GET /v1/admin/users (200)", async () => {
    await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", readerCookie)
      .expect(200)
  })

  it("anônimo recebe 401 em GET /v1/admin/users, não 403", async () => {
    await request(app.getHttpServer()).get("/v1/admin/users").expect(401)
  })

  it("rota self-service exige sessão mas nenhuma permissão", async () => {
    await request(app.getHttpServer()).get("/v1/auth/session").expect(401)
    await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Cookie", nopermCookie)
      .expect(200)
  })

  it("noperm recebe 403 RFC 7807 em GET /v1/admin/users", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", nopermCookie)
      .expect(403)
    expect(res.body.type).toMatch(/\/forbidden$/)
    expect(res.body.correlationId).toBeDefined()
  })

  it("reader SEM admin.users.create recebe 403 em POST /v1/admin/users", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", readerCookie)
      .send({
        name: "X",
        email: "x@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(403)
    expect(res.body.type).toMatch(/\/forbidden$/)
  })

  it("master cria usuário com permissions e closure válida (201)", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", "authz-create-ana")
      .send({
        name: "Ana AuthZ",
        email: "authz-ana@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.read", "admin.users.create"],
      })
      .expect(201)
  })

  it("422 invalid-permission-set quando requires falta no create", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Sem Closure",
        email: "authz-sem-closure@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.trash.purge"],
      })
      .expect(422)
    expect(res.body.type).toMatch(/\/invalid-permission-set$/)
  })

  it("422 quando o piso do perfil não é satisfeito no create", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Sem Piso",
        email: "authz-sem-piso@example.com",
        accessProfile: "admin",
        permissions: [],
      })
      .expect(422)
    expect(res.body.type).toMatch(/\/invalid-permission-set$/)
  })

  it("PUT /v1/admin/users/:id atualiza nome/perfil/set (204) e o set persiste", async () => {
    const list = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const ana = list.body.data.find(
      (u: { email: string }) => u.email === "authz-ana@example.com"
    )
    expect(ana).toBeDefined()

    await request(app.getHttpServer())
      .put(`/v1/admin/users/${ana.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Ana Editada",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(204)

    const after = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const edited = after.body.data.find(
      (u: { email: string }) => u.email === "authz-ana@example.com"
    )
    expect(edited.name).toBe("Ana Editada")
    expect(edited.permissions).toEqual(["admin.users.read"])
  })

  it("PUT em alvo master → 403", async () => {
    const list = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const master = list.body.data.find(
      (u: { email: string }) => u.email === "authz-master@example.com"
    )
    const res = await request(app.getHttpServer())
      .put(`/v1/admin/users/${master.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Master Editado",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(403)
    expect(res.body.type).toMatch(/\/forbidden$/)
  })

  it("auto-edição de permissões → 403", async () => {
    const res = await request(app.getHttpServer())
      .put(`/v1/admin/users/${readerId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", readerCookie)
      .send({
        name: "Reader",
        accessProfile: "admin",
        permissions: [
          "admin.users.read",
          "admin.users.update",
          "admin.users.create",
        ],
      })
      .expect(403)
    expect(res.body.type).toMatch(/\/forbidden$/)
  })

  it("ator restrito não concede o que não possui no create (403)", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", creatorCookie)
      .send({
        name: "Escalada",
        email: "authz-escalada@example.com",
        accessProfile: "admin",
        permissions: ["admin.tags.read"],
      })
      .expect(403)
    expect(res.body.type).toMatch(/\/permission-grant-not-allowed$/)
  })

  it("ator restrito cria com subconjunto do próprio (201)", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", creatorCookie)
      .set("Idempotency-Key", "authz-create-subconjunto")
      .send({
        name: "Sub Conjunto",
        email: "authz-subconjunto@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)
  })

  it("ator restrito renomeia usuário mais poderoso sem tocar no set (204)", async () => {
    await request(app.getHttpServer())
      .put(`/v1/admin/users/${powerfulId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", creatorCookie)
      .send({
        name: "Poder Renomeado",
        accessProfile: "admin",
        permissions: ["admin.tags.read"],
      })
      .expect(204)

    const after = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const edited = after.body.data.find(
      (u: { email: string }) => u.email === "authz-power@example.com"
    )
    expect(edited.name).toBe("Poder Renomeado")
    expect(edited.permissions).toEqual(["admin.tags.read"])
  })

  it("GET /v1/auth/session devolve accessProfile e permissions", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Cookie", readerCookie)
      .expect(200)
    expect(res.body.user.accessProfile).toBe("admin")
    expect([...res.body.user.permissions].sort()).toEqual([
      "admin.users.read",
      "admin.users.update",
    ])
  })

  it("rotas self-service passam sem permissão (noperm)", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/devices")
      .set("Cookie", nopermCookie)
      .expect(200)
    expect(Array.isArray(res.body.devices)).toBe(true)
  })

  it("CRUD de modelos: create → list contém → update → delete → list vazio", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/admin/permission-templates")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo AuthZ",
        description: "modelo de teste",
        permissions: ["admin.users.read"],
      })
      .expect(201)
    const templateId = created.body.template.id as string

    const list = await request(app.getHttpServer())
      .get("/v1/admin/permission-templates")
      .set("Cookie", masterCookie)
      .expect(200)
    expect(
      list.body.templates.some((t: { id: string }) => t.id === templateId)
    ).toBe(true)

    const updated = await request(app.getHttpServer())
      .put(`/v1/admin/permission-templates/${templateId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo AuthZ v2",
        description: null,
        permissions: ["admin.users.read", "admin.users.create"],
      })
      .expect(200)
    expect(updated.body.template.name).toBe("Modelo AuthZ v2")

    await request(app.getHttpServer())
      .delete(`/v1/admin/permission-templates/${templateId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .expect(204)

    const after = await request(app.getHttpServer())
      .get("/v1/admin/permission-templates")
      .set("Cookie", masterCookie)
      .expect(200)
    expect(
      after.body.templates.some((t: { id: string }) => t.id === templateId)
    ).toBe(false)
  })

  it("modelo com nome duplicado → 409", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/permission-templates")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo Duplicado",
        description: null,
        permissions: ["admin.users.read"],
      })
      .expect(201)
    const res = await request(app.getHttpServer())
      .post("/v1/admin/permission-templates")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo Duplicado",
        description: null,
        permissions: ["admin.users.read"],
      })
      .expect(409)
    expect(res.body.type).toMatch(/\/permission-template-name-in-use$/)
  })

  it("download de attachment continua @OptionalAuth (sem 403 do guard)", async () => {
    const res = await request(app.getHttpServer()).get(
      "/v1/attachments/01JXAUTHZ0000000000000000X"
    )
    // ACL do use case decide (404/403 próprios) — NUNCA o /forbidden do PermissionsGuard.
    expect(res.body.type ?? "").not.toMatch(/auth\/forbidden$/)
    expect(res.status).not.toBe(401)
  })
})

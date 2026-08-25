import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import { fakeMailer, loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const MASTER = "authz-master@example.com"
const READER = "authz-reader@example.com"
const NOPERM = "authz-noperm@example.com"
const CREATOR = "authz-creator@example.com"
const POWER = "authz-power@example.com"

describe("authz — AuthMiddleware + AccessGuard + validações (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let masterCookie: string[]
  let readerCookie: string[]
  let nopermCookie: string[]
  let creatorCookie: string[]
  let readerId: string
  let powerfulId: string

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp({ overrides: [[MAILER, fakeMailer()]] })

    await seedUser(e2e.app, db.pool, {
      email: MASTER,
      password: TEST_PASSWORD,
      accessProfile: "master",
    })
    readerId = await seedUser(e2e.app, db.pool, {
      email: READER,
      password: TEST_PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.users.read", "admin.users.update"],
    })
    await seedUser(e2e.app, db.pool, {
      email: NOPERM,
      password: TEST_PASSWORD,
      accessProfile: "admin",
    })
    await seedUser(e2e.app, db.pool, {
      email: CREATOR,
      password: TEST_PASSWORD,
      accessProfile: "admin",
      permissions: [
        "admin.users.read",
        "admin.users.create",
        "admin.users.update",
      ],
    })
    powerfulId = await seedUser(e2e.app, db.pool, {
      email: POWER,
      password: TEST_PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.tags.read"],
    })

    masterCookie = await loginAs(e2e.http, MASTER)
    readerCookie = await loginAs(e2e.http, READER)
    nopermCookie = await loginAs(e2e.http, NOPERM)
    creatorCookie = await loginAs(e2e.http, CREATOR)
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("reader acessa GET /v1/admin/users (200)", async () => {
    await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", readerCookie)
      .expect(200)
  })

  it("anônimo recebe 401 em GET /v1/admin/users, não 403", async () => {
    await e2e.http.get("/v1/admin/users").expect(401)
  })

  it("rota self-service exige sessão mas nenhuma permissão", async () => {
    await e2e.http.get("/v1/auth/session").expect(401)
    await e2e.http
      .get("/v1/auth/session")
      .set("Cookie", nopermCookie)
      .expect(200)
  })

  it("noperm recebe 403 RFC 7807 em GET /v1/admin/users", async () => {
    const res = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", nopermCookie)
      .expect(403)
    expect(res.body.type).toMatch(/\/forbidden$/)
    expect(res.body.correlationId).toBeDefined()
  })

  it("reader SEM admin.users.create recebe 403 em POST /v1/admin/users", async () => {
    const res = await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
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
    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
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
    const res = await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
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
    const res = await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
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
    const list = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const ana = list.body.data.find(
      (u: { email: string }) => u.email === "authz-ana@example.com"
    )
    expect(ana).toBeDefined()

    await e2e.http
      .put(`/v1/admin/users/${ana.id}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Ana Editada",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(204)

    const after = await e2e.http
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
    const list = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const master = list.body.data.find(
      (u: { email: string }) => u.email === MASTER
    )
    const res = await e2e.http
      .put(`/v1/admin/users/${master.id}`)
      .set("Origin", E2E_ORIGIN)
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
    const res = await e2e.http
      .put(`/v1/admin/users/${readerId}`)
      .set("Origin", E2E_ORIGIN)
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
    const res = await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
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
    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
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
    await e2e.http
      .put(`/v1/admin/users/${powerfulId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", creatorCookie)
      .send({
        name: "Poder Renomeado",
        accessProfile: "admin",
        permissions: ["admin.tags.read"],
      })
      .expect(204)

    const after = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const edited = after.body.data.find(
      (u: { email: string }) => u.email === POWER
    )
    expect(edited.name).toBe("Poder Renomeado")
    expect(edited.permissions).toEqual(["admin.tags.read"])
  })

  it("ator restrito não REVOGA do alvo chave que não possui (403)", async () => {
    const res = await e2e.http
      .put(`/v1/admin/users/${powerfulId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", creatorCookie)
      .send({
        name: "Poder Renomeado",
        accessProfile: "admin",
        permissions: [],
      })
      .expect(403)
    expect(res.body.type).toMatch(/\/permission-grant-not-allowed$/)

    const after = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .expect(200)
    const untouched = after.body.data.find(
      (u: { email: string }) => u.email === POWER
    )
    expect(untouched.permissions).toEqual(["admin.tags.read"])
  })

  it("GET /v1/auth/session devolve accessProfile e permissions", async () => {
    const res = await e2e.http
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
    const res = await e2e.http
      .get("/v1/auth/devices")
      .set("Cookie", nopermCookie)
      .expect(200)
    expect(Array.isArray(res.body.devices)).toBe(true)
  })

  it("CRUD de modelos: create → list contém → update → delete → list vazio", async () => {
    const created = await e2e.http
      .post("/v1/admin/permission-templates")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo AuthZ",
        description: "modelo de teste",
        permissions: ["admin.users.read"],
      })
      .expect(201)
    const templateId = created.body.template.id as string

    const list = await e2e.http
      .get("/v1/admin/permission-templates")
      .set("Cookie", masterCookie)
      .expect(200)
    expect(
      list.body.templates.some((t: { id: string }) => t.id === templateId)
    ).toBe(true)

    const updated = await e2e.http
      .put(`/v1/admin/permission-templates/${templateId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo AuthZ v2",
        description: null,
        permissions: ["admin.users.read", "admin.users.create"],
      })
      .expect(200)
    expect(updated.body.template.name).toBe("Modelo AuthZ v2")

    await e2e.http
      .delete(`/v1/admin/permission-templates/${templateId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .expect(204)

    const after = await e2e.http
      .get("/v1/admin/permission-templates")
      .set("Cookie", masterCookie)
      .expect(200)
    expect(
      after.body.templates.some((t: { id: string }) => t.id === templateId)
    ).toBe(false)
  })

  it("modelo com nome duplicado → 409", async () => {
    await e2e.http
      .post("/v1/admin/permission-templates")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .send({
        name: "Modelo Duplicado",
        description: null,
        permissions: ["admin.users.read"],
      })
      .expect(201)
    const res = await e2e.http
      .post("/v1/admin/permission-templates")
      .set("Origin", E2E_ORIGIN)
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
    const res = await e2e.http.get("/v1/attachments/01JXAUTHZ0000000000000000X")
    // ACL do use case decide (404/403 próprios) — NUNCA o /forbidden do PermissionsGuard.
    expect(res.body.type ?? "").not.toMatch(/auth\/forbidden$/)
    expect(res.status).not.toBe(401)
  })
})

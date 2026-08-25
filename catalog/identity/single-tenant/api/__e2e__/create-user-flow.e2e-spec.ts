import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader } from "../../../shared/test/e2e/http"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import { DELIVERY_DISPATCHERS } from "../../notification/testing"
import {
  fakeMailer,
  loginAs,
  seedUser,
  TEST_PASSWORD,
  tokenFromMail,
} from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"
import type { Pollable } from "../../../shared/test/e2e/outbox"

const MASTER = "master@example.com"
const SESSION_COOKIE = "rit_session"

describe("Fluxo de criação de usuário (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let mailer: ReturnType<typeof fakeMailer>
  let dispatchers: Pollable[]

  // Fixture compartilhada e só de leitura: o master é semeado uma vez e nenhum
  // `it` o altera. Semear um master POR teste rebaixaria o anterior (índice
  // único de master), que é justamente a dependência de ordem que sumiu daqui.
  let masterCookie: string[]

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    mailer = fakeMailer()
    e2e = await createE2eApp({ overrides: [[MAILER, mailer]] })
    // 2-hop assíncrono (outbox → handler → delivery): os dois despachantes
    // giram a cada volta, senão o e-mail nunca chega ao fakeMailer.
    dispatchers = DELIVERY_DISPATCHERS(e2e.app)
    await seedUser(e2e.app, db.pool, {
      email: MASTER,
      name: "Master",
      password: TEST_PASSWORD,
      accessProfile: "master",
    })
    masterCookie = await loginAs(e2e.http, MASTER)
  })

  afterAll(async () => {
    await e2e.close()
  })

  async function inviteUser(
    email: string,
    name: string,
    idempotencyKey: string
  ): Promise<void> {
    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        name,
        email,
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)
  }

  // Casa pelo destinatário, não por índice: o login do master dispara um
  // `device_new_login` que deslocaria a posição de quem lesse `sent[0]`.
  async function inviteAndCollectToken(
    email: string,
    name: string,
    idempotencyKey: string
  ): Promise<string> {
    await inviteUser(email, name, idempotencyKey)
    await drainOutbox(e2e.app, {
      dispatchers,
      until: () => mailer.sent.find((message) => message.to === email),
    })
    return tokenFromMail(mailer, email)
  }

  it("login do master retorna cookie de sessão", async () => {
    const res = await e2e.http
      .post("/v1/auth/login")
      .set("Origin", E2E_ORIGIN)
      .send({ email: MASTER, password: TEST_PASSWORD })
      .expect(200)

    const cookies = cookieHeader(res)
    expect(
      cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ).toBe(true)
    // "É cookie de sessão" só é verdade se autenticar: o Set-Cookie sozinho
    // passaria mesmo com um token que o AuthMiddleware recusa.
    const session = await e2e.http
      .get("/v1/auth/session")
      .set("Cookie", cookies)
      .expect(200)
    expect(session.body.user.email).toBe(MASTER)
  })

  it("master cria usuário Ana via rota autenticada (201)", async () => {
    const email = "ana-create@example.com"
    await inviteUser(email, "Ana", "create-user-ana")

    const { rows } = await db.pool.query<{ name: string; status: string }>(
      "SELECT name, status FROM identity.users WHERE email = $1",
      [email]
    )
    expect(rows[0]?.name).toBe("Ana")
    expect(rows[0]?.status).toBe("pending")
  })

  it("outbox + delivery dispatcher disparam sendAccessLink com token", async () => {
    const email = "ana-outbox@example.com"
    const token = await inviteAndCollectToken(
      email,
      "Ana",
      "create-user-ana-outbox"
    )
    expect(token).toBeTruthy()
  })

  it("GET /v1/auth/access-link com token válido retorna dados do usuário criado", async () => {
    const email = "ana-link@example.com"
    const token = await inviteAndCollectToken(
      email,
      "Ana",
      "create-user-ana-link"
    )

    const res = await e2e.http
      .get("/v1/auth/access-link")
      .query({ token })
      .expect(200)
    expect(res.body).toEqual({
      name: "Ana",
      email,
      avatarAttachmentId: null,
    })
  })

  it("POST /v1/auth/set-password ativa conta, retorna usuário atualizado e cookie de auto-login", async () => {
    const email = "ana-setpwd@example.com"
    const token = await inviteAndCollectToken(
      email,
      "Ana",
      "create-user-ana-setpwd"
    )

    const res = await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Ana Maria",
        birthDate: "1990-05-20",
        password: "Senha-Ana-Muito-Forte-2026!",
      })
      .expect(200)
    expect(res.body.user).toMatchObject({ name: "Ana Maria", email })

    const anaCookie = cookieHeader(res)
    expect(
      anaCookie.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ).toBe(true)

    const { rows } = await db.pool.query<{ status: string }>(
      "SELECT status FROM identity.users WHERE email = $1",
      [email]
    )
    expect(rows[0]?.status).toBe("active")
  })

  it("cookie de ativação autentica a sessão de Ana sem login manual", async () => {
    const email = "ana-session@example.com"
    const token = await inviteAndCollectToken(
      email,
      "Ana",
      "create-user-ana-session"
    )
    const activation = await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Ana Maria",
        birthDate: "1990-05-20",
        password: "Senha-Ana-Muito-Forte-2026!",
      })
      .expect(200)

    const res = await e2e.http
      .get("/v1/auth/session")
      .set("Cookie", cookieHeader(activation))
      .expect(200)
    expect(res.body.user.email).toBe(email)
  })

  it("reuso do token já consumido retorna 400", async () => {
    const email = "ana-reuse@example.com"
    const token = await inviteAndCollectToken(
      email,
      "Ana",
      "create-user-ana-reuse"
    )
    await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Ana Maria",
        birthDate: "1990-05-20",
        password: "Senha-Ana-Muito-Forte-2026!",
      })
      .expect(200)

    await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Ana",
        birthDate: "1990-05-20",
        password: "Outra-Senha-Forte-2026!",
      })
      .expect(400)
  })

  it("master cria Profissional com áreas/serviços; listagem não vaza a system perm", async () => {
    // Sem módulo de produto montado o slot profissional usa os adapters nulos:
    // área/serviço são referências opacas, validadas por quem preencher o slot.
    const areaId = "area-e2e-pro"
    const serviceId = "svc-e2e-pro"

    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", "create-user-pro")
      .send({
        name: "Pedro Profissional",
        email: "pedro@example.com",
        accessProfile: "professional",
        servesClients: true,
        permissions: [],
        areaIds: [areaId],
        serviceIds: [serviceId],
      })
      .expect(201)

    const list = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .query({ q: "pedro@example.com" })
      .expect(200)

    const pedro = list.body.data.find(
      (u: { email: string }) => u.email === "pedro@example.com"
    )
    expect(pedro).toBeDefined()
    expect(pedro.accessProfile).toBe("professional")
    expect(pedro.servesClients).toBe(true)
    expect(pedro.permissions).toEqual([])
    expect(pedro.areaIds).toEqual([areaId])
    expect(pedro.serviceIds).toEqual([serviceId])
  })

  it("cria profissional com permissão de outro módulo", async () => {
    const areaId = "area-e2e-pro-admin"

    const res = await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", "create-user-pro-admin")
      .send({
        name: "Pro Admin",
        email: "pro.admin@example.com",
        accessProfile: "professional",
        servesClients: true,
        permissions: ["admin.users.read"],
        areaIds: [areaId],
        serviceIds: [],
      })
      .expect(201)

    expect(res.status).toBe(201)

    const list = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .query({ q: "pro.admin@example.com" })
      .expect(200)

    const proadmin = list.body.data.find(
      (u: { email: string }) => u.email === "pro.admin@example.com"
    )
    expect(proadmin).toBeDefined()
    expect(proadmin.accessProfile).toBe("professional")
    expect(proadmin.permissions).toContain("admin.users.read")
    expect(proadmin.areaIds.length).toBeGreaterThan(0)
  })

  it("master cria usuário com áreas de agendamento; listagem devolve as áreas", async () => {
    const areaId = "area-e2e-sched"

    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", "create-user-sched")
      .send({
        name: "Sofia Agenda",
        email: "sofia@example.com",
        accessProfile: "admin",
        permissions: ["admin.tags.read"],
        schedulingAreaIds: [areaId],
      })
      .expect(201)

    const list = await e2e.http
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .query({ q: "sofia@example.com" })
      .expect(200)

    const sofia = list.body.data.find(
      (u: { email: string }) => u.email === "sofia@example.com"
    )
    expect(sofia).toBeDefined()
    expect(sofia.accessProfile).toBe("admin")
    expect(sofia.schedulingAreaIds).toEqual([areaId])
    expect(sofia.areaIds).toEqual([])
  })

  // GA-7: o pseudo-teste "seed master e promoção via SQL" (um
  // `expect(masterId).toBeTruthy()` sobre o seed) saiu com a quebra da cadeia
  // ordenada — é a única remoção que este refactor autoriza. O que ele
  // "cobria" virou pré-condição do `beforeAll`, e a promoção a master é hoje
  // contrato do próprio `seedUser` (testing/seed-user.ts), não deste arquivo.
})

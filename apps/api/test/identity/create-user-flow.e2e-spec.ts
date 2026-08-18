import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../src/app.module"
import { applySecurity } from "../../src/main"
import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import { MAILER, type Mailer } from "../../src/modules/notification/domain/ports/mailer"
import { DeliveryDispatcher } from "../../src/modules/notification/infrastructure/delivery/delivery.dispatcher"
import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../src/shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../../src/shared/kernel/outbox/outbox.dispatcher"
import { setCookies } from "../setup/cookies"
import { seedUser } from "../setup/seed-user"
import {
  createTestPool,
  truncateIdentity,
  truncateKernel,
} from "../setup/test-db"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

function makeFakeMailer(): jest.Mocked<Mailer> {
  return {
    sendAccessLink: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendLockoutNotice: jest.fn().mockResolvedValue(undefined),
    sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
    sendDeviceNewLogin: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeConfirmation: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeNotice: jest.fn().mockResolvedValue(undefined),
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout esperando a condição")
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe("Fluxo de criação de usuário (e2e)", () => {
  let app: INestApplication
  let dispatcher: OutboxDispatcher
  let fakeMailer: jest.Mocked<Mailer>

  // Preenchido por um `it` e consumido pelos seguintes: a suíte é
  // ordem-dependente de propósito.
  let masterCookie: string[]
  let accessToken: string
  let anaCookie: string[]

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )
    await pool.end()

    fakeMailer = makeFakeMailer()
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(MAILER)
      .useValue(fakeMailer)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
    dispatcher = app.get(OutboxDispatcher)
  })

  afterAll(async () => {
    await app.close()
  })

  it("seed master e promoção via SQL", async () => {
    const pool = createTestPool()
    const masterId = await seedUser(app, pool, {
      email: "master@example.com",
      name: "Master",
      password: "Senha-Master-Muito-Forte-2026!",
    })
    await pool.query(
      "UPDATE identity.users SET access_profile = 'master' WHERE id = $1",
      [masterId],
    )
    await pool.end()
    expect(masterId).toBeTruthy()
  })

  it("login do master retorna cookie de sessão", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "master@example.com", password: "Senha-Master-Muito-Forte-2026!" })
      .expect(200)
    masterCookie = setCookies(res)
    expect(masterCookie).toBeDefined()
  })

  it("master cria usuário Ana via rota autenticada (201)", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", "create-user-ana")
      .send({ name: "Ana", email: "ana@example.com", accessProfile: "admin", permissions: ["admin.users.read"] })
      .expect(201)
  })

  it("outbox + delivery dispatcher disparam sendAccessLink com token", async () => {
    await dispatcher.poll()
    await app.get(DeliveryDispatcher).poll()
    await waitFor(() => fakeMailer.sendAccessLink.mock.calls.length >= 1)

    const [, link] = fakeMailer.sendAccessLink.mock.calls[0] ?? []
    const token = new URL(link).searchParams.get("token")
    expect(token).toBeTruthy()
    // Persiste o token para os its seguintes.
    accessToken = token!
  })

  it("GET /v1/auth/access-link com token válido retorna dados do usuário criado", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/access-link")
      .query({ token: accessToken })
      .expect(200)
    expect(res.body).toEqual({ name: "Ana", email: "ana@example.com", avatarAttachmentId: null })
  })

  it("POST /v1/auth/set-password ativa conta, retorna usuário atualizado e cookie de auto-login", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token: accessToken,
        name: "Ana Maria",
        birthDate: "1990-05-20",
        password: "Senha-Ana-Muito-Forte-2026!",
      })
      .expect(200)
    expect(res.body.user).toMatchObject({ name: "Ana Maria", email: "ana@example.com" })
    anaCookie = setCookies(res)
    expect(anaCookie).toBeDefined()
  })

  it("cookie de ativação autentica a sessão de Ana sem login manual", async () => {
    await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Cookie", anaCookie)
      .expect(200)
  })

  it("reuso do token já consumido retorna 400", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token: accessToken,
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

    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
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

    const list = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .query({ q: "pedro@example.com" })
      .expect(200)

    const pedro = list.body.data.find(
      (u: { email: string }) => u.email === "pedro@example.com",
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

    const res = await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
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

    const list = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .query({ q: "pro.admin@example.com" })
      .expect(200)

    const proadmin = list.body.data.find(
      (u: { email: string }) => u.email === "pro.admin@example.com",
    )
    expect(proadmin).toBeDefined()
    expect(proadmin.accessProfile).toBe("professional")
    expect(proadmin.permissions).toContain("admin.users.read")
    expect(proadmin.areaIds.length).toBeGreaterThan(0)
  })

  it("master cria usuário com áreas de agendamento; listagem devolve as áreas", async () => {
    const areaId = "area-e2e-sched"

    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
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

    const list = await request(app.getHttpServer())
      .get("/v1/admin/users")
      .set("Cookie", masterCookie)
      .query({ q: "sofia@example.com" })
      .expect(200)

    const sofia = list.body.data.find(
      (u: { email: string }) => u.email === "sofia@example.com",
    )
    expect(sofia).toBeDefined()
    expect(sofia.accessProfile).toBe("admin")
    expect(sofia.schedulingAreaIds).toEqual([areaId])
    expect(sofia.areaIds).toEqual([])
  })
})

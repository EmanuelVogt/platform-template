import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../src/app.module"
import { applySecurity } from "../src/main"
import { RATE_LIMITER } from "../src/modules/identity/domain/ports/rate-limiter"
import { MAILER, type Mailer } from "../src/modules/notification/domain/ports/mailer"
import { DeliveryDispatcher } from "../src/modules/notification/infrastructure/delivery/delivery.dispatcher"
import { RequestContext } from "../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../src/shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../src/shared/kernel/outbox/outbox.dispatcher"

import { seedUser } from "./setup/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "./setup/test-db"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

// Fake do mailer: o MAIL_TRANSPORT do .env é `resend` (chave real) — sem override
// o e2e bateria na API real do Resend. O cutover é validado pela linha de
// delivery (sent + payload redigido), independente do provedor.
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

describe("Cutover de e-mail: identity → notification (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )
    await pool.end()

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(MAILER)
      .useValue(makeFakeMailer())
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("create-user → notification.requested → delivery sent com link redigido, sem in-app", async () => {
    const pool = createTestPool()

    // Master: seed como usuário comum, depois promove via SQL.
    const masterId = await seedUser(app, pool, {
      email: "master-cutover@example.com",
      name: "Master",
      password: "Senha-Master-Muito-Forte-2026!",
    })
    await pool.query("UPDATE identity.users SET access_profile = 'master' WHERE id = $1", [
      masterId,
    ])

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({
        email: "master-cutover@example.com",
        password: "Senha-Master-Muito-Forte-2026!",
      })
      .expect(200)
    const cookie = loginRes.headers["set-cookie"]

    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie!)
      .set("Idempotency-Key", "cutover-create-bia")
      .send({ name: "Bia", email: "bia-cutover@example.com", accessProfile: "admin", permissions: ["admin.users.read"] })
      .expect(201)

    // 2-hop assíncrono: o poll manual pode virar no-op se o de background já
    // roda; força + espera a delivery virar sent (fake mailer resolve na hora).
    const findSent = async (): Promise<
      { link: string; email: string } | undefined
    > => {
      await app.get(OutboxDispatcher).poll()
      await app.get(DeliveryDispatcher).poll()
      const r = await pool.query<{
        status: string
        payload: { link: string; email: string }
      }>(
        "select status, payload from notification.notification_deliveries where type = 'access_link_sent'",
      )
      return r.rows[0]?.status === "sent" ? r.rows[0].payload : undefined
    }
    let payload = await findSent()
    const start = Date.now()
    while (!payload) {
      if (Date.now() - start > 8000) {
        throw new Error("timeout esperando a delivery de access_link_sent virar sent")
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      payload = await findSent()
    }
    // Token redigido no payload em repouso (estado terminal).
    expect(payload.link).toBe("[REDACTED]")
    expect(payload.email).toBe("bia-cutover@example.com")

    // access_link_sent é email-only: nenhuma linha in-app DESSE tipo (o login
    // do master gera device_new_login in-app legítimo — filtra por type).
    const inapp = await pool.query<{ n: number }>(
      "select count(*)::int as n from notification.notifications where type = 'access_link_sent'",
    )
    expect(inapp.rows[0]?.n).toBe(0)

    await pool.end()
  })
})

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../../../shared/kernel/outbox/outbox.dispatcher"
import { MAILER } from "../../notification/domain/ports/mailer"
import { DeliveryDispatcher } from "../../notification/infrastructure/delivery/delivery.dispatcher"
import { RATE_LIMITER } from "../domain/ports/rate-limiter"
import { fakeMailer } from "../testing/fake-mailer"
import { seedUser } from "../testing/seed-user"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

describe("Cutover de e-mail: identity → notification (e2e)", () => {
  let app: INestApplication
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )
    await pool.end()

    mailer = fakeMailer()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(MAILER)
      .useValue(mailer)
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
      { id: string; payload: { link: string; email: string } } | undefined
    > => {
      await app.get(OutboxDispatcher).poll()
      await app.get(DeliveryDispatcher).poll()
      const r = await pool.query<{
        id: string
        status: string
        payload: { link: string; email: string }
      }>(
        "select id, status, payload from notification.notification_deliveries where type = 'access_link_sent'",
      )
      return r.rows[0]?.status === "sent" ? r.rows[0] : undefined
    }
    let delivery = await findSent()
    const start = Date.now()
    while (!delivery) {
      if (Date.now() - start > 8000) {
        throw new Error("timeout esperando a delivery de access_link_sent virar sent")
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      delivery = await findSent()
    }
    // Token redigido no payload em repouso (estado terminal).
    expect(delivery.payload.link).toBe("[REDACTED]")
    expect(delivery.payload.email).toBe("bia-cutover@example.com")

    // Tipo base mantém o assunto v0.1 pelo caminho genérico; idempotencyKey = delivery.id.
    const sentMessage = mailer.sent.find((m) => m.to === "bia-cutover@example.com")
    expect(sentMessage?.subject).toBe("Configure seu acesso à plataforma")
    expect(sentMessage?.idempotencyKey).toBe(delivery.id)

    // access_link_sent é email-only: nenhuma linha in-app DESSE tipo (o login
    // do master gera device_new_login in-app legítimo — filtra por type).
    const inapp = await pool.query<{ n: number }>(
      "select count(*)::int as n from notification.notifications where type = 'access_link_sent'",
    )
    expect(inapp.rows[0]?.n).toBe(0)

    await pool.end()
  })
})

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../../../src/app.module"
import { applySecurity } from "../../../../src/main"
import { RATE_LIMITER } from "../../../../src/modules/identity/domain/ports/rate-limiter"
import { MAILER } from "../domain/ports/mailer"
import { DeliveryDispatcher } from "../infrastructure/delivery/delivery.dispatcher"
import { RequestContext } from "../../../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../../src/shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../../../../src/shared/kernel/outbox/outbox.dispatcher"

import { fakeMailer } from "../testing/fake-mailer"
import { seedUser } from "../../../../test/setup/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Inapp-Muito-Forte-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

/** Extrai o href renderizado no botão de ação do e-mail (link com token). */
function linkFromHtml(html: string): string {
  const match = /href="([^"]+)"/.exec(html)
  if (!match) throw new Error("link não encontrado no e-mail")
  return match[1]!
}

describe("produtores in-app (e2e)", () => {
  let app: INestApplication
  let pool: Pool
  let mailer: ReturnType<typeof fakeMailer>

  // 2-hop assíncrono (outbox → handler → delivery): força os ciclos em loop até
  // a condição valer — o poll manual pode virar no-op se o de background já roda.
  async function pollUntil<T>(
    probe: () => Promise<T | undefined>,
    timeoutMs = 8000,
  ): Promise<T> {
    const start = Date.now()
    for (;;) {
      await app.get(OutboxDispatcher).poll()
      await app.get(DeliveryDispatcher).poll()
      const found = await probe()
      if (found !== undefined) {
        return found
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error("timeout esperando a condição do e2e in-app")
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  async function login(email: string, password: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password })
      .expect(200)
    const setCookie = res.get("Set-Cookie")
    if (!setCookie) {
      throw new Error("login não retornou Set-Cookie")
    }
    return setCookie
  }

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )

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
    await pool.end()
  })

  it("change-password → item no feed + badge + delivery de e-mail", async () => {
    await seedUser(app, pool, {
      email: "inapp-ana@example.com",
      name: "Ana",
      password: PASSWORD,
    })
    const cookie = await login("inapp-ana@example.com", PASSWORD)

    await request(app.getHttpServer())
      .post("/v1/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: PASSWORD, newPassword: "Senha-Nova-Forte-2026!" })
      .expect(204)

    // O login do device novo também produz in-app (device_new_login) — o feed
    // determinístico desta sessão é exatamente {device_new_login, password_changed}.
    type Item = { type: string; metadata: Record<string, unknown> }
    const feed = await pollUntil(async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/notifications")
        .set("Origin", ORIGIN)
        .set("Cookie", cookie)
        .expect(200)
      const items = res.body.data as Item[]
      return items.some((i) => i.type === "password_changed") ? items : undefined
    })
    expect(feed.map((i) => i.type).sort()).toEqual([
      "device_new_login",
      "password_changed",
    ])
    const changed = feed.find((i) => i.type === "password_changed")
    expect(changed?.metadata).toEqual({ at: expect.any(String) })
    expect(JSON.stringify(changed)).not.toContain("Senha-Nova-Forte-2026!")

    const count = await request(app.getHttpServer())
      .get("/v1/notifications/unseen-count")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(200)
    expect(count.body.count).toBe(2)

    const delivery = await pollUntil(async () => {
      const r = await pool.query<{ status: string; channel: string }>(
        "select status, channel from notification.notification_deliveries where type = 'password_changed'",
      )
      return r.rows[0]?.status === "sent" ? r.rows[0] : undefined
    })
    expect(delivery.channel).toBe("email")
  })

  it("fluxo create-user → set-password notifica o admin criador", async () => {
    const masterId = await seedUser(app, pool, {
      email: "inapp-master@example.com",
      name: "Master",
      password: PASSWORD,
    })
    await pool.query("UPDATE identity.users SET access_profile = 'master' WHERE id = $1", [
      masterId,
    ])
    const cookie = await login("inapp-master@example.com", PASSWORD)

    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .set("Idempotency-Key", "inapp-create-bia")
      .send({ name: "Bia", email: "inapp-bia@example.com", accessProfile: "admin", permissions: ["admin.users.read"] })
      .expect(201)

    // Token do access link sai pelo fake mailer (nunca em claro no banco).
    const link = await pollUntil(async () => {
      const message = mailer.sent.find((m) => m.to === "inapp-bia@example.com")
      return message ? linkFromHtml(message.html) : undefined
    })
    const token = new URL(link).searchParams.get("token")
    expect(token).toBeTruthy()

    await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token,
        name: "Bia",
        birthDate: "1992-03-10",
        password: "Senha-Bia-Muito-Forte-2026!",
      })
      .expect(200)

    type Item = { type: string; title: string; metadata: Record<string, unknown> }
    const feed = await pollUntil(async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/notifications")
        .set("Origin", ORIGIN)
        .set("Cookie", cookie)
        .expect(200)
      const items = res.body.data as Item[]
      return items.some((i) => i.type === "password_set") ? items : undefined
    })
    const activated = feed.find((i) => i.type === "password_set")
    expect(activated?.title).toBe("Conta ativada")
    expect(activated?.metadata).toEqual({ userName: "Bia" })
  })
})

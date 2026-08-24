import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../../../shared/kernel/outbox/outbox.dispatcher"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { seedUser } from "../testing/seed-user"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Feed-Muito-Forte-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
  reset: () => Promise.resolve(),
}

type Lifecycle = {
  seenAt?: string | null
  readAt?: string | null
  archivedAt?: string | null
}

async function seedNotification(
  pool: Pool,
  recipientId: string,
  over: Lifecycle = {},
): Promise<string> {
  const id = ulid()
  await pool.query(
    `insert into notification.notifications
       (id, recipient_id, type, title, body, actions, metadata, locale, seen_at, read_at, archived_at)
     values ($1, $2, 'password_changed', 't', 'b', '[]', '{"at":"2026-06-10T00:00:00.000Z"}', 'pt-BR', $3, $4, $5)`,
    [id, recipientId, over.seenAt ?? null, over.readAt ?? null, over.archivedAt ?? null],
  )
  return id
}

describe("feed de notificações (e2e)", () => {
  let app: INestApplication
  let pool: Pool
  let cookie: string[]
  let userA: string
  let userB: string

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()

    userA = await seedUser(app, pool, {
      email: "feed-a@example.com",
      name: "Ana",
      password: PASSWORD,
    })
    userB = await seedUser(app, pool, {
      email: "feed-b@example.com",
      name: "Bia",
      password: PASSWORD,
    })

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "feed-a@example.com", password: PASSWORD })
      .expect(200)
    const setCookie = loginRes.get("Set-Cookie")
    if (!setCookie) {
      throw new Error("login não retornou Set-Cookie")
    }
    cookie = setCookie

    // O login publica device_new_login (produtor in-app). Drena o outbox ATÉ a
    // linha existir — senão o dispatcher de background a insere DEPOIS do
    // truncate do beforeEach e contamina a contagem dos testes.
    const start = Date.now()
    for (;;) {
      await app.get(OutboxDispatcher).poll()
      const r = await pool.query<{ n: number }>(
        "select count(*)::int as n from notification.notifications where recipient_id = $1 and type = 'device_new_login'",
        [userA],
      )
      if ((r.rows[0]?.n ?? 0) >= 1) {
        break
      }
      if (Date.now() - start > 8000) {
        throw new Error("timeout drenando device_new_login do login de setup")
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query("truncate table notification.notifications")
  })

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set("Origin", ORIGIN).set("Cookie", cookie)
  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set("Origin", ORIGIN).set("Cookie", cookie)

  it("GET /v1/notifications lista só as do user logado, inbox por default", async () => {
    await seedNotification(pool, userA)
    await seedNotification(pool, userA)
    await seedNotification(pool, userB)

    const res = await get("/v1/notifications").expect(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.page.total).toBe(2)
  })

  it("GET /v1/notifications?filter aplica a semântica da spec", async () => {
    await seedNotification(pool, userA)
    await seedNotification(pool, userA, { readAt: "2026-06-10T01:00:00.000Z", seenAt: "2026-06-10T01:00:00.000Z" })
    await seedNotification(pool, userA, { archivedAt: "2026-06-10T02:00:00.000Z" })

    expect((await get("/v1/notifications").expect(200)).body.page.total).toBe(2)
    expect((await get("/v1/notifications?filter=unread").expect(200)).body.page.total).toBe(1)
    expect((await get("/v1/notifications?filter=read").expect(200)).body.page.total).toBe(1)
    expect((await get("/v1/notifications?filter=archived").expect(200)).body.page.total).toBe(1)
    expect((await get("/v1/notifications?filter=all").expect(200)).body.page.total).toBe(3)
  })

  it("GET /v1/notifications/unseen-count reflete o badge; POST /seen zera", async () => {
    await seedNotification(pool, userA)
    await seedNotification(pool, userA)

    expect((await get("/v1/notifications/unseen-count").expect(200)).body.count).toBe(2)
    await post("/v1/notifications/seen").expect(204)
    expect((await get("/v1/notifications/unseen-count").expect(200)).body.count).toBe(0)
  })

  it("POST /read-all marca todas lidas (e vistas) só do user logado", async () => {
    await seedNotification(pool, userA)
    await seedNotification(pool, userA)
    const idB = await seedNotification(pool, userB)

    await post("/v1/notifications/read-all").expect(204)
    expect((await get("/v1/notifications?filter=read").expect(200)).body.page.total).toBe(2)
    expect((await get("/v1/notifications?filter=unread").expect(200)).body.page.total).toBe(0)
    expect((await get("/v1/notifications/unseen-count").expect(200)).body.count).toBe(0)

    const b = await pool.query<{ read_at: Date | null }>(
      "select read_at from notification.notifications where id = $1",
      [idB],
    )
    expect(b.rows[0]?.read_at).toBeNull()
  })

  it("POST /:id/read marca lida (e vista); id de OUTRO user → 204 no-op", async () => {
    const idA = await seedNotification(pool, userA)
    const idB = await seedNotification(pool, userB)

    await post(`/v1/notifications/${idA}/read`).expect(204)
    const a = await pool.query<{ read_at: Date | null; seen_at: Date | null }>(
      "select read_at, seen_at from notification.notifications where id = $1",
      [idA],
    )
    expect(a.rows[0]?.read_at).not.toBeNull()
    expect(a.rows[0]?.seen_at).not.toBeNull()

    await post(`/v1/notifications/${idB}/read`).expect(204)
    const b = await pool.query<{ read_at: Date | null }>(
      "select read_at from notification.notifications where id = $1",
      [idB],
    )
    expect(b.rows[0]?.read_at).toBeNull()
  })

  it("POST /:id/archive tira do inbox; aparece em ?filter=archived", async () => {
    const id = await seedNotification(pool, userA)

    await post(`/v1/notifications/${id}/archive`).expect(204)
    expect((await get("/v1/notifications").expect(200)).body.page.total).toBe(0)
    expect((await get("/v1/notifications?filter=archived").expect(200)).body.page.total).toBe(1)
  })

  it("sem sessão → 401 problem+json", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/notifications")
      .set("Origin", ORIGIN)
      .expect(401)
    expect(res.headers["content-type"]).toContain("application/problem+json")
  })
})

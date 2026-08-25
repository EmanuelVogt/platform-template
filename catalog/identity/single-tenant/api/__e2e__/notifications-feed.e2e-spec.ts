import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { expectProblem } from "../../../shared/test/e2e/problem"
import { resetDb } from "../../../shared/test/int/db"
import { loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"
import type { Pool } from "pg"

const EMAIL_A = "feed-a@example.com"
const EMAIL_B = "feed-b@example.com"

type Lifecycle = {
  seenAt?: string | null
  readAt?: string | null
  archivedAt?: string | null
}

async function seedNotification(
  pool: Pool,
  recipientId: string,
  over: Lifecycle = {}
): Promise<string> {
  const id = ulid()
  await pool.query(
    `insert into notification.notifications
       (id, recipient_id, type, title, body, actions, metadata, locale, seen_at, read_at, archived_at)
     values ($1, $2, 'password_changed', 't', 'b', '[]', '{"at":"2026-06-10T00:00:00.000Z"}', 'pt-BR', $3, $4, $5)`,
    [
      id,
      recipientId,
      over.seenAt ?? null,
      over.readAt ?? null,
      over.archivedAt ?? null,
    ]
  )
  return id
}

describe("feed de notificações (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let cookies: string[]
  let userA: string
  let userB: string

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    e2e = await createE2eApp()

    userA = await seedUser(e2e.app, db.pool, {
      email: EMAIL_A,
      name: "Ana",
      password: TEST_PASSWORD,
    })
    userB = await seedUser(e2e.app, db.pool, {
      email: EMAIL_B,
      name: "Bia",
      password: TEST_PASSWORD,
    })

    cookies = await loginAs(e2e.http, EMAIL_A)

    // O login publica device_new_login (produtor in-app). Drena o outbox ATÉ a
    // linha existir — senão o dispatcher de background a insere DEPOIS do
    // truncate do beforeEach e contamina a contagem dos testes.
    await drainOutbox(e2e.app, {
      timeoutMs: 8_000,
      intervalMs: 50,
      until: async () => {
        const r = await db.pool.query<{ n: number }>(
          "select count(*)::int as n from notification.notifications where recipient_id = $1 and type = 'device_new_login'",
          [userA]
        )
        return (r.rows[0]?.n ?? 0) >= 1 ? r.rows[0] : undefined
      },
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  beforeEach(async () => {
    await db.pool.query("truncate table notification.notifications")
  })

  const get = (path: string) =>
    e2e.http.get(path).set("Origin", E2E_ORIGIN).set("Cookie", cookies)
  const post = (path: string) =>
    e2e.http.post(path).set("Origin", E2E_ORIGIN).set("Cookie", cookies)

  it("GET /v1/notifications lista só as do user logado, inbox por default", async () => {
    await seedNotification(db.pool, userA)
    await seedNotification(db.pool, userA)
    await seedNotification(db.pool, userB)

    const res = await get("/v1/notifications").expect(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.page.total).toBe(2)
  })

  it("GET /v1/notifications?filter aplica a semântica da spec", async () => {
    await seedNotification(db.pool, userA)
    await seedNotification(db.pool, userA, {
      readAt: "2026-06-10T01:00:00.000Z",
      seenAt: "2026-06-10T01:00:00.000Z",
    })
    await seedNotification(db.pool, userA, {
      archivedAt: "2026-06-10T02:00:00.000Z",
    })

    expect((await get("/v1/notifications").expect(200)).body.page.total).toBe(2)
    expect(
      (await get("/v1/notifications?filter=unread").expect(200)).body.page.total
    ).toBe(1)
    expect(
      (await get("/v1/notifications?filter=read").expect(200)).body.page.total
    ).toBe(1)
    expect(
      (await get("/v1/notifications?filter=archived").expect(200)).body.page
        .total
    ).toBe(1)
    expect(
      (await get("/v1/notifications?filter=all").expect(200)).body.page.total
    ).toBe(3)
  })

  it("GET /v1/notifications/unseen-count reflete o badge; POST /seen zera", async () => {
    await seedNotification(db.pool, userA)
    await seedNotification(db.pool, userA)

    expect(
      (await get("/v1/notifications/unseen-count").expect(200)).body.count
    ).toBe(2)
    await post("/v1/notifications/seen").expect(204)
    expect(
      (await get("/v1/notifications/unseen-count").expect(200)).body.count
    ).toBe(0)
  })

  it("POST /read-all marca todas lidas (e vistas) só do user logado", async () => {
    await seedNotification(db.pool, userA)
    await seedNotification(db.pool, userA)
    const idB = await seedNotification(db.pool, userB)

    await post("/v1/notifications/read-all").expect(204)
    expect(
      (await get("/v1/notifications?filter=read").expect(200)).body.page.total
    ).toBe(2)
    expect(
      (await get("/v1/notifications?filter=unread").expect(200)).body.page.total
    ).toBe(0)
    expect(
      (await get("/v1/notifications/unseen-count").expect(200)).body.count
    ).toBe(0)

    const b = await db.pool.query<{ read_at: Date | null }>(
      "select read_at from notification.notifications where id = $1",
      [idB]
    )
    expect(b.rows[0]?.read_at).toBeNull()
  })

  it("POST /:id/read marca lida (e vista); id de OUTRO user → 204 no-op", async () => {
    const idA = await seedNotification(db.pool, userA)
    const idB = await seedNotification(db.pool, userB)

    await post(`/v1/notifications/${idA}/read`).expect(204)
    const a = await db.pool.query<{
      read_at: Date | null
      seen_at: Date | null
    }>(
      "select read_at, seen_at from notification.notifications where id = $1",
      [idA]
    )
    expect(a.rows[0]?.read_at).not.toBeNull()
    expect(a.rows[0]?.seen_at).not.toBeNull()

    await post(`/v1/notifications/${idB}/read`).expect(204)
    const b = await db.pool.query<{ read_at: Date | null }>(
      "select read_at from notification.notifications where id = $1",
      [idB]
    )
    expect(b.rows[0]?.read_at).toBeNull()
  })

  it("POST /:id/archive tira do inbox; aparece em ?filter=archived", async () => {
    const id = await seedNotification(db.pool, userA)

    await post(`/v1/notifications/${id}/archive`).expect(204)
    expect((await get("/v1/notifications").expect(200)).body.page.total).toBe(0)
    expect(
      (await get("/v1/notifications?filter=archived").expect(200)).body.page
        .total
    ).toBe(1)
  })

  it("sem sessão → 401 problem+json", async () => {
    const res = await e2e.http
      .get("/v1/notifications")
      .set("Origin", E2E_ORIGIN)
      .expect(401)
    expectProblem(res, { status: 401 })
  })
})

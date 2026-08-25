import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
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

const ANA = "inapp-ana@example.com"
const MASTER = "inapp-master@example.com"
const BIA = "inapp-bia@example.com"

describe("produtores in-app (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let mailer: ReturnType<typeof fakeMailer>
  let dispatchers: Pollable[]

  // 2-hop assíncrono (outbox → handler → delivery): gira os dois despachantes a
  // cada volta — o poll manual pode virar no-op se o de background já roda.
  function until<T>(
    probe: () => Promise<T | undefined>
  ): Promise<T | undefined> {
    return drainOutbox<T>(e2e.app, {
      dispatchers,
      until: probe,
      timeoutMs: 8_000,
      intervalMs: 50,
    })
  }

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    mailer = fakeMailer()
    e2e = await createE2eApp({ overrides: [[MAILER, mailer]] })
    dispatchers = DELIVERY_DISPATCHERS(e2e.app)
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("change-password → item no feed + badge + delivery de e-mail", async () => {
    await seedUser(e2e.app, db.pool, {
      email: ANA,
      name: "Ana",
      password: TEST_PASSWORD,
    })
    const cookies = await loginAs(e2e.http, ANA)

    await e2e.http
      .post("/v1/auth/change-password")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: "Senha-Nova-Forte-2026!",
      })
      .expect(204)

    // O login do device novo também produz in-app (device_new_login) — o feed
    // determinístico desta sessão é exatamente {device_new_login, password_changed}.
    type Item = { type: string; metadata: Record<string, unknown> }
    const feed = await until<Item[]>(async () => {
      const res = await e2e.http
        .get("/v1/notifications")
        .set("Origin", E2E_ORIGIN)
        .set("Cookie", cookies)
        .expect(200)
      const items = res.body.data as Item[]
      return items.some((i) => i.type === "password_changed")
        ? items
        : undefined
    })
    expect(feed).toBeDefined()
    expect(feed!.map((i) => i.type).sort()).toEqual([
      "device_new_login",
      "password_changed",
    ])
    const changed = feed!.find((i) => i.type === "password_changed")
    expect(changed?.metadata).toEqual({ at: expect.any(String) })
    expect(JSON.stringify(changed)).not.toContain("Senha-Nova-Forte-2026!")

    const count = await e2e.http
      .get("/v1/notifications/unseen-count")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
    expect(count.body.count).toBe(2)

    const delivery = await until<{ status: string; channel: string }>(
      async () => {
        const r = await db.pool.query<{ status: string; channel: string }>(
          "select status, channel from notification.notification_deliveries where type = 'password_changed'"
        )
        return r.rows[0]?.status === "sent" ? r.rows[0] : undefined
      }
    )
    expect(delivery?.channel).toBe("email")
  })

  it("fluxo create-user → set-password notifica o admin criador", async () => {
    await seedUser(e2e.app, db.pool, {
      email: MASTER,
      name: "Master",
      password: TEST_PASSWORD,
      accessProfile: "master",
    })
    const cookies = await loginAs(e2e.http, MASTER)

    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .set("Idempotency-Key", "inapp-create-bia")
      .send({
        name: "Bia",
        email: BIA,
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)

    // Token do access link sai pelo fake mailer (nunca em claro no banco).
    const token = await until<string>(async () =>
      Promise.resolve(
        mailer.sent.some((m) => m.to === BIA)
          ? tokenFromMail(mailer, BIA)
          : undefined
      )
    )
    expect(token).toBeTruthy()

    await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Bia",
        birthDate: "1992-03-10",
        password: "Senha-Bia-Muito-Forte-2026!",
      })
      .expect(200)

    type Item = {
      type: string
      title: string
      metadata: Record<string, unknown>
    }
    const feed = await until<Item[]>(async () => {
      const res = await e2e.http
        .get("/v1/notifications")
        .set("Origin", E2E_ORIGIN)
        .set("Cookie", cookies)
        .expect(200)
      const items = res.body.data as Item[]
      return items.some((i) => i.type === "password_set") ? items : undefined
    })
    const activated = feed!.find((i) => i.type === "password_set")
    expect(activated?.title).toBe("Conta ativada")
    expect(activated?.metadata).toEqual({ userName: "Bia" })
  })
})

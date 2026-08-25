import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import { DELIVERY_DISPATCHERS, findSent } from "../../notification/testing"
import { fakeMailer, loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const MASTER = "master-cutover@example.com"
const BIA = "bia-cutover@example.com"

describe("Cutover de e-mail: identity → notification (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    mailer = fakeMailer()
    e2e = await createE2eApp({ overrides: [[MAILER, mailer]] })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("create-user → notification.requested → delivery sent com link redigido, sem in-app", async () => {
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
      .set("Idempotency-Key", "cutover-create-bia")
      .send({
        name: "Bia",
        email: BIA,
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)

    // 2-hop assíncrono: gira outbox + delivery até a linha virar `sent` (o fake
    // mailer resolve na hora); sem dormir esperando o poll de background.
    const delivery = await drainOutbox(e2e.app, {
      dispatchers: DELIVERY_DISPATCHERS(e2e.app),
      timeoutMs: 8_000,
      intervalMs: 50,
      until: () =>
        findSent<{ link: string; email: string }>(db.pool, "access_link_sent"),
    })
    expect(delivery).toBeDefined()

    // Token redigido no payload em repouso (estado terminal).
    expect(delivery!.payload.link).toBe("[REDACTED]")
    expect(delivery!.payload.email).toBe(BIA)

    // Tipo base mantém o assunto v0.1 pelo caminho genérico; idempotencyKey = delivery.id.
    const sentMessage = mailer.sent.find((m) => m.to === BIA)
    expect(sentMessage?.subject).toBe("Configure seu acesso à plataforma")
    expect(sentMessage?.idempotencyKey).toBe(delivery!.id)

    // access_link_sent é email-only: nenhuma linha in-app DESSE tipo (o login
    // do master gera device_new_login in-app legítimo — filtra por type).
    const inapp = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from notification.notifications where type = 'access_link_sent'"
    )
    expect(inapp.rows[0]?.n).toBe(0)
  })
})

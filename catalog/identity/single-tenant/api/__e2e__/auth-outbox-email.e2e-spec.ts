import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import { DELIVERY_DISPATCHERS } from "../../notification/testing"
import { fakeMailer, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

describe("Outbox → dispatcher → handler → mailer (e2e)", () => {
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

  it("forgot-password emite o evento no outbox e o dispatcher entrega ao mailer 1x; re-poll não reenvia", async () => {
    const email = "reset-flow@example.com"
    const userId = await seedUser(e2e.app, db.pool, {
      email,
      name: "Reset Flow",
      password: TEST_PASSWORD,
    })

    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", "outbox-reset-flow")
      .send({ email })
      .expect(202)

    // R13/R14: o evento foi persistido no outbox na MESMA tx do negócio.
    const outboxRows = await db.pool.query<{
      event_name: string
      payload: { payload: { link: string } }
    }>(
      "SELECT event_name, payload FROM _kernel.outbox WHERE aggregate_id = $1",
      [userId]
    )
    expect(outboxRows.rows).toHaveLength(1)
    expect(outboxRows.rows[0]?.event_name).toBe("notification.requested")

    // Cutover 2-hop: outbox entrega notification.requested ao handler (enfileira
    // delivery); o DeliveryDispatcher envia via mailer.
    const dispatchers = DELIVERY_DISPATCHERS(e2e.app)
    await drainOutbox(e2e.app, {
      dispatchers,
      until: () => mailer.sent.find((message) => message.to === email),
    })

    const sentToEmail = mailer.sent.filter((message) => message.to === email)
    expect(sentToEmail).toHaveLength(1)
    expect(sentToEmail[0]?.subject).toBe("Redefinição de senha")
    expect(sentToEmail[0]?.html).toContain("/redefinir-senha?token=")

    // A linha foi marcada published_at após a entrega.
    const published = await db.pool.query<{ published_at: Date | null }>(
      "SELECT published_at FROM _kernel.outbox WHERE aggregate_id = $1",
      [userId]
    )
    expect(published.rows[0]?.published_at).not.toBeNull()

    // O auth_event de sucesso foi gravado dentro da tx do negócio.
    const events = await db.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity.auth_events WHERE event_type = 'password_reset_requested'"
    )
    expect(Number(events.rows[0]?.count)).toBeGreaterThanOrEqual(1)

    // Dedupe: re-poll NÃO reenvia (outbox published_at + delivery status=sent/lease).
    await drainOutbox(e2e.app, { dispatchers })
    expect(mailer.sent.filter((message) => message.to === email)).toHaveLength(
      1
    )
  })
})

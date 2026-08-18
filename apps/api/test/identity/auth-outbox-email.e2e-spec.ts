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
import { seedUser } from "../setup/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "../setup/test-db"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

/** Fake em memória do port de e-mail — conta os envios (entrega ao transporte). */
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

describe("Outbox → dispatcher → handler → mailer (e2e)", () => {
  let app: INestApplication
  let dispatcher: OutboxDispatcher
  let fakeMailer: jest.Mocked<Mailer>

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

  it("forgot-password emite o evento no outbox e o dispatcher entrega ao mailer 1x; re-poll não reenvia", async () => {
    const email = "reset-flow@example.com"
    const pool = createTestPool()
    const userId = await seedUser(app, pool, {
      email,
      name: "Reset Flow",
      password: "Senha-Muito-Forte-2026!",
    })

    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", "outbox-reset-flow")
      .send({ email })
      .expect(202)

    // R13/R14: o evento foi persistido no outbox na MESMA tx do negócio.
    const outboxRows = await pool.query<{
      event_name: string
      payload: { payload: { link: string } }
    }>(
      "SELECT event_name, payload FROM _kernel.outbox WHERE aggregate_id = $1",
      [userId],
    )
    expect(outboxRows.rows).toHaveLength(1)
    expect(outboxRows.rows[0]?.event_name).toBe("notification.requested")

    // Cutover 2-hop: outbox entrega notification.requested ao handler (enfileira
    // delivery); o DeliveryDispatcher envia via mailer.
    await dispatcher.poll()
    await app.get(DeliveryDispatcher).poll()
    await waitFor(() => fakeMailer.sendPasswordReset.mock.calls.length >= 1)

    expect(fakeMailer.sendPasswordReset.mock.calls).toHaveLength(1)
    const [to, link] = fakeMailer.sendPasswordReset.mock.calls[0] ?? []
    expect(to).toBe(email)
    expect(link).toContain("/redefinir-senha?token=")

    // A linha foi marcada published_at após a entrega.
    const published = await pool.query<{ published_at: Date | null }>(
      "SELECT published_at FROM _kernel.outbox WHERE aggregate_id = $1",
      [userId],
    )
    expect(published.rows[0]?.published_at).not.toBeNull()

    // O auth_event de sucesso foi gravado dentro da tx do negócio.
    const events = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity.auth_events WHERE event_type = 'password_reset_requested'",
    )
    expect(Number(events.rows[0]?.count)).toBeGreaterThanOrEqual(1)

    // Dedupe: re-poll NÃO reenvia (outbox published_at + delivery status=sent/lease).
    await dispatcher.poll()
    await app.get(DeliveryDispatcher).poll()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(fakeMailer.sendPasswordReset.mock.calls).toHaveLength(1)

    await pool.end()
  })
})

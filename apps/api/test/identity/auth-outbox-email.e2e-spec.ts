import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../src/app.module"
import { applySecurity } from "../../src/main"
import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import { MAILER } from "../../src/modules/notification/domain/ports/mailer"
import { DeliveryDispatcher } from "../../src/modules/notification/infrastructure/delivery/delivery.dispatcher"
import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../src/shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../../src/shared/kernel/outbox/outbox.dispatcher"
import { fakeMailer } from "../setup/fake-mailer"
import { seedUser } from "../setup/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "../setup/test-db"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

/** Extrai o href renderizado no botão de ação do e-mail (link com token). */
function linkFromHtml(html: string): string {
  const match = /href="([^"]+)"/.exec(html)
  if (!match) throw new Error("link não encontrado no e-mail")
  return match[1]!
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
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    await waitFor(() => mailer.sent.some((message) => message.to === email))

    const sentToEmail = mailer.sent.filter((message) => message.to === email)
    expect(sentToEmail).toHaveLength(1)
    expect(sentToEmail[0]?.subject).toBe("Redefinição de senha")
    expect(linkFromHtml(sentToEmail[0]!.html)).toContain("/redefinir-senha?token=")

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
    expect(mailer.sent.filter((message) => message.to === email)).toHaveLength(1)

    await pool.end()
  })
})

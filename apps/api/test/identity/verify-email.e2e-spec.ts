import request from "supertest"

import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import { MAILER, type Mailer } from "../../src/modules/notification/domain/ports/mailer"
import { OutboxDispatcher } from "../../src/shared/kernel/outbox/outbox.dispatcher"
import { allowAllRateLimiter, createE2eApp } from "../setup/app-factory"
import { seedUser } from "../setup/seed-user"
import {
  createTestPool,
  seedEmail,
  truncateIdentity,
  truncateKernel,
} from "../setup/test-db"

import type { INestApplication } from "@nestjs/common"

const ORIGIN = "http://localhost:5173"
const SUITE = "ve"

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

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout esperando a condição")
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe("Verificação de e-mail (e2e)", () => {
  let app: INestApplication
  let dispatcher: OutboxDispatcher
  let fakeMailer: jest.Mocked<Mailer>

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    fakeMailer = makeFakeMailer()
    app = await createE2eApp((b) =>
      b
        .overrideProvider(RATE_LIMITER)
        .useValue(allowAllRateLimiter)
        .overrideProvider(MAILER)
        .useValue(fakeMailer),
    )
    dispatcher = app.get(OutboxDispatcher)
  })

  afterAll(async () => {
    await app.close()
  })

  /**
   * Semeia um usuário não-verificado, faz login e solicita reenvio do token de
   * verificação. Retorna o token bruto extraído do link capturado pelo fakeMailer.
   */
  async function setupUnverifiedUser(
    email: string,
    password: string,
    callIndex: number,
  ): Promise<{ sessionCookie: string[]; token: string }> {
    const pool = createTestPool()
    await seedUser(app, pool, {
      email,
      password,
      name: "Usuário Teste",
      emailVerified: false,
    })
    await pool.end()

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password })
      .expect(200)
    const sessionCookie = loginRes.headers["set-cookie"] as unknown as string[]

    await request(app.getHttpServer())
      .post("/v1/auth/resend-verification")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie)
      .expect(202)

    await dispatcher.poll()
    await waitFor(() => fakeMailer.sendEmailVerification.mock.calls.length > callIndex)

    // sendEmailVerification(to, link, locale, idempotencyKey?)
    const [, link] = fakeMailer.sendEmailVerification.mock.calls[callIndex] ?? []
    const token = new URL(link!).searchParams.get("token")
    expect(token).toBeTruthy()
    return { sessionCookie, token: token! }
  }

  it("token válido → 204 + email_verified=true no banco", async () => {
    const email = seedEmail(SUITE, "happy")
    const password = "Senha-Verify-Forte-2026!"
    const { token } = await setupUnverifiedUser(email, password, 0)

    await request(app.getHttpServer())
      .post("/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({ token })
      .expect(204)

    const pool = createTestPool()
    const { rows } = await pool.query<{ email_verified: boolean }>(
      "SELECT email_verified FROM identity.users WHERE email = $1",
      [email],
    )
    await pool.end()
    expect(rows[0]?.email_verified).toBe(true)
  })

  it("token já consumido na segunda chamada → 400 RFC 7807", async () => {
    const email = seedEmail(SUITE, "reuse")
    const password = "Senha-Reuse-Forte-2026!"
    const { token } = await setupUnverifiedUser(email, password, 1)

    await request(app.getHttpServer())
      .post("/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({ token })
      .expect(204)

    const res = await request(app.getHttpServer())
      .post("/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({ token })
      .expect(400)

    expect(res.body).toMatchObject({
      status: 400,
    })
  })

  it("token completamente inválido (string aleatória) → 400 RFC 7807", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({ token: "token-invalido-nao-existe-no-banco" })
      .expect(400)

    expect(res.body).toMatchObject({
      status: 400,
    })
  })

  it("token expirado (inserted direto no banco com expiresAt no passado) → 400", async () => {
    const email = seedEmail(SUITE, "expired")
    const password = "Senha-Expired-Forte-2026!"

    const pool = createTestPool()
    await seedUser(app, pool, {
      email,
      password,
      name: "Usuário Expirado",
      emailVerified: false,
    })
    const { rows: userRows } = await pool.query<{ id: string }>(
      "SELECT id FROM identity.users WHERE email = $1",
      [email],
    )
    const userId = userRows[0]?.id
    expect(userId).toBeTruthy()

    const { createHash, randomBytes } = await import("node:crypto")
    const rawToken = randomBytes(32).toString("base64url")
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")
    const { ulid } = await import("ulid")
    await pool.query(
      `INSERT INTO identity.verification_tokens
         (id, user_id, type, token_hash, expires_at, created_at)
       VALUES ($1, $2, 'email_verify', $3, now() - interval '1 hour', now())`,
      [ulid(), userId, tokenHash],
    )
    await pool.end()

    const res = await request(app.getHttpServer())
      .post("/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({ token: rawToken })
      .expect(400)

    expect(res.body).toMatchObject({
      status: 400,
    })
  })

  it("payload sem token → 400 de validação", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({})
      .expect(400)
  })
})

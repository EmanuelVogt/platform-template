import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import {
  emails,
  fakeMailer,
  loginAs,
  seedUser,
  TEST_PASSWORD,
  tokenFromMail,
} from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const mail = emails("ve")
const SUBJECT = "Verifique seu e-mail"

describe("Verificação de e-mail (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    mailer = fakeMailer()
    e2e = await createE2eApp({ overrides: [[MAILER, mailer]] })
  })

  afterAll(async () => {
    await e2e.close()
  })

  /**
   * Semeia um usuário não-verificado, faz login e solicita reenvio do token de
   * verificação. Retorna o token bruto extraído do link capturado pelo fakeMailer.
   */
  async function setupUnverifiedUser(
    email: string
  ): Promise<{ cookies: string[]; token: string }> {
    await seedUser(e2e.app, db.pool, {
      email,
      password: TEST_PASSWORD,
      name: "Usuário Teste",
      emailVerified: false,
    })

    const cookies = await loginAs(e2e.http, email)

    await e2e.http
      .post("/v1/auth/resend-verification")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(202)

    // Casa por destinatário + assunto: o login pode disparar um e-mail de
    // device_new_login antes do de verificação, deslocando o índice.
    await drainOutbox(e2e.app, {
      until: () =>
        mailer.sent.find(
          (message) => message.to === email && message.subject === SUBJECT
        ),
    })

    return {
      cookies,
      token: tokenFromMail(mailer, email, { subject: SUBJECT }),
    }
  }

  it("token válido → 204 + email_verified=true no banco", async () => {
    const email = mail("happy")
    const { token } = await setupUnverifiedUser(email)

    await e2e.http
      .post("/v1/auth/verify-email")
      .set("Origin", E2E_ORIGIN)
      .send({ token })
      .expect(204)

    const { rows } = await db.pool.query<{ email_verified: boolean }>(
      "SELECT email_verified FROM identity.users WHERE email = $1",
      [email]
    )
    expect(rows[0]?.email_verified).toBe(true)
  })

  it("token já consumido na segunda chamada → 400 RFC 7807", async () => {
    const email = mail("reuse")
    const { token } = await setupUnverifiedUser(email)

    await e2e.http
      .post("/v1/auth/verify-email")
      .set("Origin", E2E_ORIGIN)
      .send({ token })
      .expect(204)

    const res = await e2e.http
      .post("/v1/auth/verify-email")
      .set("Origin", E2E_ORIGIN)
      .send({ token })
      .expect(400)

    expect(res.body).toMatchObject({ status: 400 })
  })

  it("token completamente inválido (string aleatória) → 400 RFC 7807", async () => {
    const res = await e2e.http
      .post("/v1/auth/verify-email")
      .set("Origin", E2E_ORIGIN)
      .send({ token: "token-invalido-nao-existe-no-banco" })
      .expect(400)

    expect(res.body).toMatchObject({ status: 400 })
  })

  it("token expirado (inserted direto no banco com expiresAt no passado) → 400", async () => {
    const email = mail("expired")

    const userId = await seedUser(e2e.app, db.pool, {
      email,
      password: TEST_PASSWORD,
      name: "Usuário Expirado",
      emailVerified: false,
    })

    const { createHash, randomBytes } = await import("node:crypto")
    const rawToken = randomBytes(32).toString("base64url")
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")
    const { ulid } = await import("ulid")
    await db.pool.query(
      `INSERT INTO identity.verification_tokens
         (id, user_id, type, token_hash, expires_at, created_at)
       VALUES ($1, $2, 'email_verify', $3, now() - interval '1 hour', now())`,
      [ulid(), userId, tokenHash]
    )

    const res = await e2e.http
      .post("/v1/auth/verify-email")
      .set("Origin", E2E_ORIGIN)
      .send({ token: rawToken })
      .expect(400)

    expect(res.body).toMatchObject({ status: 400 })
  })

  it("payload sem token → 400 de validação", async () => {
    await e2e.http
      .post("/v1/auth/verify-email")
      .set("Origin", E2E_ORIGIN)
      .send({})
      .expect(400)
  })
})

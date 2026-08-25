import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { InMemoryRateLimiter } from "../../../shared/kernel/rate-limit/in-memory-rate-limiter"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader } from "../../../shared/test/e2e/http"
import { expectProblem } from "../../../shared/test/e2e/problem"
import { resetDb } from "../../../shared/test/int/db"
import { seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const EMAIL = "login-cookie@example.com"
const BRUTE_EMAIL = "login-brute@example.com"

const db = withE2ePool()

describe("Login — cookie de sessão (e2e)", () => {
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp()
    await seedUser(e2e.app, db.pool, {
      email: EMAIL,
      name: "Login Cookie",
      password: TEST_PASSWORD,
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("login retorna 200 com user e Set-Cookie __Host- httpOnly SameSite", async () => {
    const res = await e2e.http
      .post("/v1/auth/login")
      .set("Origin", E2E_ORIGIN)
      .send({ email: EMAIL, password: TEST_PASSWORD, rememberMe: true })
      .expect(200)

    expect(res.body.user.email).toBe(EMAIL)
    expect(res.body.user.id).toBeDefined()

    const cookie = cookieHeader(res)[0]
    // e2e-env usa COOKIE_NAME=rit_session (sem prefixo __Host-, que exige Secure).
    expect(cookie).toContain("rit_session=")
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//i)
    expect(cookie).not.toMatch(/Domain=/i)
    // Secure depende de COOKIE_SECURE (false no e2e-env); não asserido aqui.
  })
})

describe("Login — força bruta distribuída por conta (e2e)", () => {
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp({
      // Limiter real (em memória): o bucket por conta precisa contar de verdade.
      rateLimiter: "real",
      overrides: [[RATE_LIMITER, new InMemoryRateLimiter()]],
      // TRUST_PROXY_HOPS é 0 por padrão; sem confiar em um hop o teste não
      // conseguiria variar o IP de origem, que é o ponto do caso.
      beforeInit: (app) => {
        app.getHttpAdapter().getInstance().set("trust proxy", 1)
      },
    })
    await seedUser(e2e.app, db.pool, {
      email: BRUTE_EMAIL,
      name: "Login Brute",
      password: TEST_PASSWORD,
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("11ª falha na mesma conta, vinda de dois IPs, responde 429 com Retry-After", async () => {
    const attempt = (ip: string) =>
      e2e.http
        .post("/v1/auth/login")
        .set("Origin", E2E_ORIGIN)
        .set("X-Forwarded-For", ip)
        .send({
          email: BRUTE_EMAIL,
          password: "senha-errada",
          rememberMe: false,
        })

    const responses: Awaited<ReturnType<typeof attempt>>[] = []
    for (let i = 0; i < 11; i++) {
      // Alterna os IPs: o teto de 10 é da conta, não de um IP (o bucket por
      // IP é 30/min e nem chega perto de estourar aqui).
      responses.push(
        await attempt(i % 2 === 0 ? "203.0.113.7" : "198.51.100.9")
      )
    }
    const last = responses[10]!
    expectProblem(last, { status: 429, type: "/identity/rate-limited" })
    expect(last.headers["retry-after"]).toBeDefined()
    expect(responses.slice(0, 10).map((res) => res.status)).toEqual(
      Array(10).fill(401)
    )
  })

  it("senha correta depois de falhas limpa o bucket da conta", async () => {
    const email = "login-brute-reset@example.com"
    await seedUser(e2e.app, db.pool, {
      email,
      name: "Login Brute Reset",
      password: TEST_PASSWORD,
    })

    const login = (password: string) =>
      e2e.http
        .post("/v1/auth/login")
        .set("Origin", E2E_ORIGIN)
        .set("X-Forwarded-For", "203.0.113.8")
        .send({ email, password, rememberMe: false })

    for (let i = 0; i < 9; i++) {
      await login("senha-errada")
    }
    await login(TEST_PASSWORD).expect(200)

    // Bucket zerado: outras 9 falhas ainda não estouram o teto de 10.
    for (let i = 0; i < 9; i++) {
      await login("senha-errada").expect(401)
    }
  })
})

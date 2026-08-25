import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { InMemoryRateLimiter } from "../../../shared/kernel/rate-limit/in-memory-rate-limiter"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieValue } from "../../../shared/test/e2e/http"
import { resetDb } from "../../../shared/test/int/db"
import { PASSWORD_HASHER } from "../domain/ports/password-hasher"
import { IDENTITY_CONFIG, parseIdentityConfig } from "../identity.config"
import { seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"
import type { IdentityConfig } from "../identity.config"

const EMAIL = "csrf-none@example.com"

const db = withE2ePool()

const fakeHasher = {
  hash: () => Promise.resolve("argon2-fake"),
  verify: () => Promise.resolve(true),
  needsRehash: () => false,
}

describe("CSRF double-submit sob SameSite=none (e2e)", () => {
  let e2e: E2eApp
  // Espelho de `e2e` só para o teardown: se o beforeAll cair antes de criar o
  // app, um `close()` sem guarda estoura e mascara a causa real da falha.
  let openApp: E2eApp | undefined
  let cfg: IdentityConfig
  let sessionCookie: string
  let csrfToken: string

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])

    cfg = parseIdentityConfig({
      ...process.env,
      COOKIE_SAMESITE: "none",
      COOKIE_SECURE: "true",
      COOKIE_NAME: "app_session",
      // SameSite=none exige API_ORIGIN no mesmo host de WEB_ORIGIN: o cookie de
      // CSRF é host-only e o SPA não o leria de outro host.
      API_ORIGIN: E2E_ORIGIN,
      CSRF_SECRET: "z".repeat(40),
    })

    e2e = openApp = await createE2eApp({
      overrides: [
        [IDENTITY_CONFIG, cfg],
        [PASSWORD_HASHER, fakeHasher],
      ],
    })
    await seedUser(e2e.app, db.pool, {
      email: EMAIL,
      name: "CSRF User",
      password: TEST_PASSWORD,
    })

    const login = await e2e.http
      .post("/v1/auth/login")
      .set("Origin", E2E_ORIGIN)
      .send({ email: EMAIL, password: "qualquer", rememberMe: false })
      .expect(200)

    sessionCookie = cookieValue(login, cfg.COOKIE_NAME) ?? ""
    csrfToken = cookieValue(login, cfg.CSRF_COOKIE_NAME) ?? ""
  })

  afterAll(async () => {
    await openApp?.close()
  })

  it("login emite o cookie de CSRF legível", () => {
    expect(csrfToken.length).toBeGreaterThan(0)
    expect(sessionCookie.length).toBeGreaterThan(0)
  })

  it("mutação SEM X-CSRF-Token → 403", async () => {
    await e2e.http
      .delete("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", `${cfg.COOKIE_NAME}=${sessionCookie}`)
      .expect(403)
  })

  it("mutação COM X-CSRF-Token válido → 204", async () => {
    await e2e.http
      .delete("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", `${cfg.COOKIE_NAME}=${sessionCookie}`)
      .set("X-CSRF-Token", csrfToken)
      .expect(204)
  })

  it("mutação com X-CSRF-Token forjado → 403", async () => {
    await e2e.http
      .delete("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", `${cfg.COOKIE_NAME}=${sessionCookie}`)
      .set("X-CSRF-Token", "forjado-invalido")
      .expect(403)
  })

  it("GET /auth/session (safe) não exige X-CSRF-Token", async () => {
    await e2e.http
      .get("/v1/auth/session")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", `${cfg.COOKIE_NAME}=${sessionCookie}`)
      .expect(200)
  })
})

describe("Origin forjada não gasta bucket (e2e)", () => {
  let e2e: E2eApp
  let openApp: E2eApp | undefined
  let consumed: string[]

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])

    const inner = new InMemoryRateLimiter()
    consumed = []
    const spyingLimiter = {
      consume: (
        key: string,
        limit: number,
        windowSeconds: number
      ): ReturnType<InMemoryRateLimiter["consume"]> => {
        consumed.push(key)
        return inner.consume(key, limit, windowSeconds)
      },
      reset: (key: string) => inner.reset(key),
    }

    e2e = openApp = await createE2eApp({
      rateLimiter: "real",
      overrides: [
        [PASSWORD_HASHER, fakeHasher],
        [RATE_LIMITER, spyingLimiter],
      ],
    })
  })

  afterAll(async () => {
    await openApp?.close()
  })

  it("Origin de outro site é 403 e o bucket segue intacto para o pedido legítimo", async () => {
    const forgotPassword = (origin: string, i: number) =>
      e2e.http
        .post("/v1/auth/forgot-password")
        .set("Origin", origin)
        .set("Idempotency-Key", `csrf-bucket-${origin}-${i}`)
        .send({ email: "bucket@example.com" })

    // O limite de forgot-password é 3/min: cinco tentativas forjadas o
    // estourariam se o rate limiter rodasse antes do CSRF.
    for (let i = 0; i < 5; i++) {
      await forgotPassword("http://evil.example.com", i).expect(403)
    }
    expect(consumed).toEqual([])

    for (let i = 0; i < 3; i++) {
      const res = await forgotPassword(E2E_ORIGIN, i)
      expect(res.status).not.toBe(429)
    }
    expect(consumed).toHaveLength(3)
  })
})

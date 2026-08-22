import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { ulid } from "ulid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { PASSWORD_HASHER } from "../domain/ports/password-hasher"
import { InMemoryRateLimiter } from "../../../shared/kernel/rate-limit/in-memory-rate-limiter"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { allowAllRateLimiter } from "../testing/allow-all-rate-limiter"
import {
  IDENTITY_CONFIG,
  parseIdentityConfig,
} from "../identity.config"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const EMAIL = "csrf-none@example.com"

const fakeHasher = {
  hash: () => Promise.resolve("argon2-fake"),
  verify: () => Promise.resolve(true),
  needsRehash: () => false,
}

function cookieValue(
  setCookie: string[] | undefined,
  name: string,
): string | undefined {
  for (const c of setCookie ?? []) {
    const m = new RegExp(`^${name}=([^;]+)`).exec(c)
    if (m?.[1] !== undefined) {
      return decodeURIComponent(m[1])
    }
  }
  return undefined
}

async function seedUser(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO identity.users
       (id, name, email, email_verified, password_hash, pepper_version, failed_login_attempts)
     VALUES ($1, $2, $3, true, $4, 1, 0)`,
    [ulid(), "CSRF User", EMAIL, "argon2-dummy"],
  )
}

describe("CSRF double-submit sob SameSite=none (e2e)", () => {
  let app: INestApplication
  let pool: Pool
  let sessionCookie: string
  let csrfToken: string

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await seedUser(pool)

    const cfg = parseIdentityConfig({
      ...process.env,
      COOKIE_SAMESITE: "none",
      COOKIE_SECURE: "true",
      COOKIE_NAME: "rit_session",
      CSRF_SECRET: "z".repeat(40),
    })

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(cfg)
      .overrideProvider(PASSWORD_HASHER)
      .useValue(fakeHasher)
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAllRateLimiter)
      .compile()

    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EMAIL, password: "qualquer", rememberMe: false })
      .expect(200)

    const setCookie = login.headers["set-cookie"] as unknown as
      | string[]
      | undefined
    sessionCookie = cookieValue(setCookie, "rit_session") ?? ""
    csrfToken = cookieValue(setCookie, "rit_csrf") ?? ""
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  it("login emite o cookie rit_csrf legível", () => {
    expect(csrfToken.length).toBeGreaterThan(0)
    expect(sessionCookie.length).toBeGreaterThan(0)
  })

  it("mutação SEM X-CSRF-Token → 403", async () => {
    await request(app.getHttpServer())
      .delete("/v1/auth/devices")
      .set("Origin", ORIGIN)
      .set("Cookie", `rit_session=${sessionCookie}`)
      .expect(403)
  })

  it("mutação COM X-CSRF-Token válido → 204", async () => {
    await request(app.getHttpServer())
      .delete("/v1/auth/devices")
      .set("Origin", ORIGIN)
      .set("Cookie", `rit_session=${sessionCookie}`)
      .set("X-CSRF-Token", csrfToken)
      .expect(204)
  })

  it("mutação com X-CSRF-Token forjado → 403", async () => {
    await request(app.getHttpServer())
      .delete("/v1/auth/devices")
      .set("Origin", ORIGIN)
      .set("Cookie", `rit_session=${sessionCookie}`)
      .set("X-CSRF-Token", "forjado-invalido")
      .expect(403)
  })

  it("GET /auth/session (safe) não exige X-CSRF-Token", async () => {
    await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Origin", ORIGIN)
      .set("Cookie", `rit_session=${sessionCookie}`)
      .expect(200)
  })
})

describe("Origin forjada não gasta bucket (e2e)", () => {
  let app: INestApplication
  let pool: Pool
  let consumed: string[]

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)

    const inner = new InMemoryRateLimiter()
    consumed = []
    const spyingLimiter = {
      consume: (
        key: string,
        limit: number,
        windowSeconds: number,
      ): ReturnType<InMemoryRateLimiter["consume"]> => {
        consumed.push(key)
        return inner.consume(key, limit, windowSeconds)
      },
      reset: (key: string) => inner.reset(key),
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PASSWORD_HASHER)
      .useValue(fakeHasher)
      .overrideProvider(RATE_LIMITER)
      .useValue(spyingLimiter)
      .compile()

    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  it("Origin de outro site é 403 e o bucket segue intacto para o pedido legítimo", async () => {
    const forgotPassword = (origin: string, i: number) =>
      request(app.getHttpServer())
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
      const res = await forgotPassword(ORIGIN, i)
      expect(res.status).not.toBe(429)
    }
    expect(consumed).toHaveLength(3)
  })
})

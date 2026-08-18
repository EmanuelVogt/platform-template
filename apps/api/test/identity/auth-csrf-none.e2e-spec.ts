import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { ulid } from "ulid"

import { AppModule } from "../../src/app.module"
import { applySecurity } from "../../src/main"
import { PASSWORD_HASHER } from "../../src/modules/identity/domain/ports/password-hasher"
import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import {
  IDENTITY_CONFIG,
  parseIdentityConfig,
} from "../../src/modules/identity/identity.config"
import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../src/shared/kernel/context/request-context.middleware"
import { createTestPool, truncateIdentity, truncateKernel } from "../setup/test-db"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const EMAIL = "csrf-none@example.com"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}
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
      .useValue(allowAll)
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

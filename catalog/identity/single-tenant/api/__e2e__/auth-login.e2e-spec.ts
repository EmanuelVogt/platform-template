import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { seedUser } from "../testing/seed-user"

const ORIGIN = "http://localhost:5173"
const EMAIL = "login-cookie@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

describe("Login — cookie de sessão (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()

    const seedPool = createTestPool()
    await seedUser(app, seedPool, {
      email: EMAIL,
      name: "Login Cookie",
      password: PASSWORD,
    })
    await seedPool.end()
  })

  afterAll(async () => {
    await app.close()
  })

  it("login retorna 200 com user e Set-Cookie __Host- httpOnly SameSite", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EMAIL, password: PASSWORD, rememberMe: true })
      .expect(200)

    expect(res.body.user.email).toBe(EMAIL)
    expect(res.body.user.id).toBeDefined()

    const setCookie = res.headers["set-cookie"]
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
    // e2e-env usa COOKIE_NAME=rit_session (sem prefixo __Host-, que exige Secure).
    expect(cookie).toContain("rit_session=")
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//i)
    expect(cookie).not.toMatch(/Domain=/i)
    // Secure depende de COOKIE_SECURE (false no e2e-env); não asserido aqui.
  })
})

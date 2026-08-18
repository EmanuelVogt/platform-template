import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../src/app.module"
import { applySecurity } from "../../src/main"
import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../src/shared/kernel/context/request-context.middleware"
import { seedUser } from "../setup/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "../setup/test-db"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const EMAIL = "logout-e2e@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"
const SESSION_COOKIE = "rit_session"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

/** Extrai o valor de um cookie específico do header Set-Cookie. */
function extractCookieValue(
  setCookie: string[] | string | undefined,
  name: string,
): string | undefined {
  const arr =
    setCookie === undefined
      ? []
      : Array.isArray(setCookie)
        ? setCookie
        : [setCookie]
  for (const entry of arr) {
    const pair = entry.split(";", 1)[0] ?? ""
    const eq = pair.indexOf("=")
    if (eq > 0 && pair.slice(0, eq) === name) {
      return pair.slice(eq + 1)
    }
  }
  return undefined
}

describe("Logout — POST /v1/auth/logout (e2e)", () => {
  let app: INestApplication
  let pool: Pool

  beforeAll(async () => {
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

    pool = createTestPool()
  })

  afterAll(async () => {
    await pool.end()
    await app.close()
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await seedUser(app, pool, {
      email: EMAIL,
      name: "Logout E2E",
      password: PASSWORD,
    })
  })

  /** Realiza login e devolve o valor bruto do cookie de sessão. */
  async function login(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EMAIL, password: PASSWORD, rememberMe: false })
      .expect(200)

    const value = extractCookieValue(
      res.headers["set-cookie"],
      SESSION_COOKIE,
    )
    if (!value) throw new Error("login não emitiu cookie de sessão")
    return value
  }

  it("logout com sessão válida → 204 e cookie de sessão apagado", async () => {
    const sessionValue = await login()

    const res = await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", `${SESSION_COOKIE}=${sessionValue}`)
      .expect(204)

    expect(res.text).toBe("")

    const setCookie = res.headers["set-cookie"] as string[] | string | undefined
    const joined = Array.isArray(setCookie)
      ? setCookie.join(";")
      : (setCookie ?? "")
    expect(joined).toContain(`${SESSION_COOKIE}=;`)
    expect(joined).toMatch(/Max-Age=0/i)
  })

  it("após logout, rota autenticada retorna 401", async () => {
    const sessionValue = await login()

    await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", `${SESSION_COOKIE}=${sessionValue}`)
      .expect(204)

    await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Origin", ORIGIN)
      .set("Cookie", `${SESSION_COOKIE}=${sessionValue}`)
      .expect(401)
  })

  it("logout sem sessão (cookie ausente) → 401", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Origin", ORIGIN)
      .expect(401)
  })

  it("logout sem Origin → 403 (CSRF guard rejeita por Origin ausente)", async () => {
    const sessionValue = await login()

    await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Cookie", `${SESSION_COOKIE}=${sessionValue}`)
      .expect(403)
  })
})

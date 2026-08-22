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
const EMAIL = "access-history@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

async function loginAndGetCookie(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: EMAIL, password: PASSWORD, rememberMe: true })
    .expect(200)
  const setCookie = res.headers["set-cookie"]
  return (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string
}

describe("Histórico de acesso — GET /auth/access-history (e2e)", () => {
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
    await seedUser(app, seedPool, { email: EMAIL, name: "Access History", password: PASSWORD })
    await seedPool.end()
  })

  afterAll(async () => {
    await app.close()
  })

  it("autenticado → 200 com envelope paginado e campos corretos", async () => {
    // o login em si já gera um evento login_success
    const cookie = await loginAndGetCookie(app)

    const res = await request(app.getHttpServer())
      .get("/v1/auth/access-history?page=1&pageSize=10")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(200)

    const { data, page } = res.body as {
      data: Record<string, unknown>[]
      page: { total: number; page: number; pageSize: number; totalPages: number }
    }

    // envelope de paginação
    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(10)
    expect(typeof page.total).toBe("number")
    expect(typeof page.totalPages).toBe("number")

    // ao menos o login_success do step acima deve constar
    expect(data.length).toBeGreaterThan(0)

    // campos obrigatórios em cada item
    for (const item of data) {
      expect(typeof item.id).toBe("string")
      expect(typeof item.eventType).toBe("string")
      expect(typeof item.createdAt).toBe("string")
      // ipAddress e userAgent podem ser null (supertest não envia header real)
      expect("ipAddress" in item).toBe(true)
      expect("userAgent" in item).toBe(true)

      // campos sensíveis NÃO devem vazar
      expect(item).not.toHaveProperty("emailHash")
      expect(item).not.toHaveProperty("correlationId")
      expect(item).not.toHaveProperty("traceId")
      expect(item).not.toHaveProperty("spanId")
      expect(item).not.toHaveProperty("metadata")
    }
  })

  it("sem cookie → 401", async () => {
    await request(app.getHttpServer())
      .get("/v1/auth/access-history")
      .set("Origin", ORIGIN)
      .expect(401)
  })
})

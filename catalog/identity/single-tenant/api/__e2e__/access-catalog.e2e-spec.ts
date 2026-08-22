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
const EMAIL = "access-catalog@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

type AccessCatalogBody = {
  modules: { key: string }[]
  profiles: { key: string; label: string; assignable: boolean }[]
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

describe("Catálogo de acesso — GET /access-catalog (e2e)", () => {
  let app: INestApplication
  let cookie: string

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
      name: "Access Catalog",
      password: PASSWORD,
    })
    await seedPool.end()

    cookie = await loginAndGetCookie(app)
  })

  afterAll(async () => {
    await app.close()
  })

  async function getCatalog(): Promise<AccessCatalogBody> {
    const res = await request(app.getHttpServer())
      .get("/v1/access-catalog")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(200)
    return res.body as AccessCatalogBody
  }

  it("lista os perfis do base-set com rótulo em pt-BR e a marcação de atribuível", async () => {
    const body = await getCatalog()

    expect(body.profiles).toEqual([
      { key: "master", label: "Master", assignable: false },
      { key: "admin", label: "Administrador", assignable: true },
      { key: "professional", label: "Profissional", assignable: true },
    ])
  })

  it("segue devolvendo os módulos do catálogo de permissões", async () => {
    const body = await getCatalog()

    expect(body.modules.map((m) => m.key)).toContain("admin")
  })

  it("sem cookie → 401", async () => {
    await request(app.getHttpServer())
      .get("/v1/access-catalog")
      .set("Origin", ORIGIN)
      .expect(401)
  })
})

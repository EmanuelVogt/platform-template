import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"

const ORIGIN = "http://localhost:5173"

describe("Sessão — rota protegida (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("rota protegida sem cookie → 401 + Set-Cookie de limpeza", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Origin", ORIGIN)
      .expect(401)
    const setCookie = res.headers["set-cookie"] as string[] | string | undefined
    const joined = Array.isArray(setCookie)
      ? setCookie.join(";")
      : (setCookie ?? "")
    // e2e-env usa COOKIE_NAME=rit_session (sem prefixo __Host-, que exige Secure).
    expect(joined).toContain("rit_session=;")
    expect(joined).toMatch(/Max-Age=0/i)
  })
})

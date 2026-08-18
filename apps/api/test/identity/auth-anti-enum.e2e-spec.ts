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

const ORIGIN = "http://localhost:5173"
const EXISTING = "anti-enum-existe@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

function bodyShape(body: Record<string, unknown>) {
  // remove o que PODE variar (correlationId/instance); o resto deve ser
  // byte-idêntico entre os caminhos de falha (anti-enumeração).
  const { correlationId: _c, instance: _i, ...rest } = body
  return rest
}

describe("Login — anti-enumeração byte-idêntica (e2e)", () => {
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
      email: EXISTING,
      name: "Existe",
      password: PASSWORD,
    })
    await seedPool.end()
  })

  afterAll(async () => {
    await app.close()
  })

  it("inexistente e senha-errada produzem corpo byte-idêntico (401)", async () => {
    const inexistente = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({
        email: "nao-existe@example.com",
        password: "qualquer-coisa",
        rememberMe: true,
      })
      .expect(401)

    const senhaErrada = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EXISTING, password: "errada-errada", rememberMe: true })
      .expect(401)

    expect(bodyShape(inexistente.body)).toEqual(bodyShape(senhaErrada.body))
    expect(inexistente.body.status).toBe(401)
    expect(typeof inexistente.body.type).toBe("string")
    // nenhum corpo pode vazar o estado real da conta:
    expect(JSON.stringify(inexistente.body)).not.toMatch(/lock|verif|exist/i)
  })

  it("não vaza token de sessão em login falho", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EXISTING, password: "errada", rememberMe: true })
      .expect(401)
    const setCookie = res.headers["set-cookie"] as string[] | string | undefined
    const joined = Array.isArray(setCookie)
      ? setCookie.join(";")
      : (setCookie ?? "")
    expect(joined).not.toMatch(/__Host-rit_session=[A-Za-z0-9_-]{20,}/)
  })
})

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"

const ORIGIN = "http://localhost:5173"

describe("Rate-limit — 429 RFC 7807 (e2e)", () => {
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

  it("estouro do limite de forgot-password (3/min) responde 429 problem+json", async () => {
    const fire = (i: number) =>
      request(app.getHttpServer())
        .post("/v1/auth/forgot-password")
        .set("Origin", ORIGIN)
        .set("Idempotency-Key", `forgot-${i}`)
        .send({ email: "rate@example.com" })

    // limite forgot = 3/min — dispara o suficiente p/ estourar (guard 429 vem
    // antes do interceptor de idempotência).
    let last = await fire(0)
    for (let i = 0; i < 6; i++) {
      last = await fire(i + 1)
    }

    expect(last.status).toBe(429)
    expect(last.headers["retry-after"]).toBeDefined()
    expect(last.headers["content-type"]).toMatch(/application\/problem\+json/)
    expect(last.body.status).toBe(429)
    expect(last.body.type).toBeDefined()
  })
})

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { RATE_LIMITER } from "../domain/ports/rate-limiter"

const ORIGIN = "http://localhost:5173"

// Rate-limit neutralizado: o cap real (3/60s) estouraria com várias chamadas
// do mesmo IP. O foco aqui são os ramos do interceptor de idempotência.
const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

describe("IdempotencyInterceptor (e2e)", () => {
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
  })

  afterAll(async () => {
    await app.close()
  })

  it("sem Idempotency-Key → executa sem dedup (header opcional)", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .send({ email: "user@example.com" })
      .expect(202)

    const pool = createTestPool()
    const { rows } = await pool.query(
      "SELECT 1 FROM _kernel.idempotency_keys WHERE endpoint = $1",
      ["POST /v1/auth/forgot-password"],
    )
    await pool.end()
    expect(rows).toHaveLength(0)
  })

  it("com Idempotency-Key → 202", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", "idem-202")
      .send({ email: "user@example.com" })
      .expect(202)
  })

  it("replay mesma key+body → 202 idêntico (status do snapshot)", async () => {
    const key = "idem-replay"
    const body = { email: "replay@example.com" }
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(202)
    // 2ª chamada serve do snapshot — status idêntico (prova consistência C4).
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(202)
  })

  it("mesma key + body diferente → 422", async () => {
    const key = "idem-422"
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ email: "first@example.com" })
      .expect(202)
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ email: "second@example.com" })
      .expect(422)
  })

  it("snapshot não persiste PII em claro no response_body", async () => {
    const key = "idem-redact"
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ email: "pii@example.com" })
      .expect(202)

    const pool = createTestPool()
    const { rows } = await pool.query<{ response_body: unknown }>(
      "SELECT response_body FROM _kernel.idempotency_keys WHERE key = $1",
      [key],
    )
    await pool.end()

    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0]?.response_body ?? null)).not.toContain(
      "pii@example.com",
    )
  })
})

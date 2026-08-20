import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"

const ORIGIN = "http://localhost:5173"

describe("Reset — token nunca em corpo/instance/log (e2e)", () => {
  let app: INestApplication
  const logged: string[] = []
  let originalWrite: typeof process.stdout.write

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    // captura stdout (pino) para inspecionar vazamento de token
    originalWrite = process.stdout.write.bind(process.stdout)
    ;(process.stdout.write as unknown) = (
      chunk: string | Uint8Array,
    ): boolean => {
      logged.push(chunk.toString())
      return true
    }

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
    ;(process.stdout.write as unknown) = originalWrite
    await app.close()
  })

  it("reset com token no body → token bruto não aparece no corpo, instance nem log", async () => {
    const FAKE_TOKEN = "token-secreto-de-reset-que-nao-pode-vazar-123456789"

    const res = await request(app.getHttpServer())
      .post("/v1/auth/reset-password")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", "reset-fake")
      .send({ token: FAKE_TOKEN, password: "Senha-Nova-Muito-Forte-2026!" })

    // token inválido → erro de cliente (4xx); o corpo não pode ecoar o token
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(JSON.stringify(res.body)).not.toContain(FAKE_TOKEN)
    if (res.body.instance) {
      expect(res.body.instance).not.toContain(FAKE_TOKEN)
    }

    const allLogs = logged.join("")
    expect(allLogs).not.toContain(FAKE_TOKEN)
  })
})

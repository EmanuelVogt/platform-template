import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createTestPool,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"

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

  // SPEC_DEVIATION: cookie inválido no lugar de "sem cookie" no cenário de
  // limpeza. Reason: auth.middleware.ts só chama clearSessionCookie quando
  // HAVIA um cookie (raw truthy) — cookie ausente sai cedo em `if (!raw)`
  // sem tocar Set-Cookie (auth.middleware.ts:79-85, doc do próprio arquivo:
  // "Set-Cookie de limpeza quando havia cookie"; auth.middleware.spec.ts
  // cobre os dois casos e só asserta `cleared` no de cookie inválido). O
  // teste original testava exatamente o caso em que a produção não limpa —
  // gate de DB tier por entrada (AC3) rodou pela 1ª vez e expôs a asserção
  // errada.
  it("rota protegida sem cookie → 401 sem Set-Cookie de limpeza", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Origin", ORIGIN)
      .expect(401)
    expect(res.headers["set-cookie"]).toBeUndefined()
  })

  it("rota protegida com cookie inválido → 401 + Set-Cookie de limpeza", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Origin", ORIGIN)
      .set("Cookie", "rit_session=nao-e-um-token-de-sessao-valido")
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

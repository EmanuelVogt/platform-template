import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader } from "../../../shared/test/e2e/http"
import { resetDb } from "../../../shared/test/int/db"

import type { E2eApp } from "../../../shared/test/e2e/app"

describe("Sessão — rota protegida (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp({ rateLimiter: "real" })
  })

  afterAll(async () => {
    await e2e.close()
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
    const res = await e2e.http
      .get("/v1/auth/session")
      .set("Origin", E2E_ORIGIN)
      .expect(401)
    expect(cookieHeader(res)).toEqual([])
  })

  it("rota protegida com cookie inválido → 401 + Set-Cookie de limpeza", async () => {
    const res = await e2e.http
      .get("/v1/auth/session")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", "rit_session=nao-e-um-token-de-sessao-valido")
      .expect(401)
    const joined = cookieHeader(res).join(";")
    // e2e-env usa COOKIE_NAME=rit_session (sem prefixo __Host-, que exige Secure).
    expect(joined).toContain("rit_session=;")
    expect(joined).toMatch(/Max-Age=0/i)
  })
})

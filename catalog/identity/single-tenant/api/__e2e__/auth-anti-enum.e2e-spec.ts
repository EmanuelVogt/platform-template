import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { InMemoryRateLimiter } from "../../../shared/kernel/rate-limit/in-memory-rate-limiter"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader } from "../../../shared/test/e2e/http"
import { resetDb } from "../../../shared/test/int/db"
import { seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const EXISTING = "anti-enum-existe@example.com"

const db = withE2ePool()

function bodyShape(body: Record<string, unknown>) {
  // remove o que PODE variar (correlationId/instance); o resto deve ser
  // byte-idêntico entre os caminhos de falha (anti-enumeração).
  const { correlationId: _c, instance: _i, ...rest } = body
  return rest
}

describe("Login — anti-enumeração byte-idêntica (e2e)", () => {
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp()
    await seedUser(e2e.app, db.pool, {
      email: EXISTING,
      name: "Existe",
      password: TEST_PASSWORD,
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("inexistente e senha-errada produzem corpo byte-idêntico (401)", async () => {
    const inexistente = await e2e.http
      .post("/v1/auth/login")
      .set("Origin", E2E_ORIGIN)
      .send({
        email: "nao-existe@example.com",
        password: "qualquer-coisa",
        rememberMe: true,
      })
      .expect(401)

    const senhaErrada = await e2e.http
      .post("/v1/auth/login")
      .set("Origin", E2E_ORIGIN)
      .send({ email: EXISTING, password: "errada-errada", rememberMe: true })
      .expect(401)

    expect(bodyShape(inexistente.body)).toEqual(bodyShape(senhaErrada.body))
    expect(inexistente.body.status).toBe(401)
    expect(typeof inexistente.body.type).toBe("string")
    // nenhum corpo pode vazar o estado real da conta:
    expect(JSON.stringify(inexistente.body)).not.toMatch(/lock|verif|exist/i)
  })

  it("não vaza token de sessão em login falho", async () => {
    const res = await e2e.http
      .post("/v1/auth/login")
      .set("Origin", E2E_ORIGIN)
      .send({ email: EXISTING, password: "errada", rememberMe: true })
      .expect(401)
    const joined = cookieHeader(res).join(";")
    expect(joined).not.toMatch(/__Host-rit_session=[A-Za-z0-9_-]{20,}/)
  })
})

describe("Login — 429 do bucket por conta não distingue e-mail (e2e)", () => {
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp({
      rateLimiter: "real",
      overrides: [[RATE_LIMITER, new InMemoryRateLimiter()]],
    })
    await seedUser(e2e.app, db.pool, {
      email: EXISTING,
      name: "Existe",
      password: TEST_PASSWORD,
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  async function exhaust(email: string) {
    const attempt = () =>
      e2e.http
        .post("/v1/auth/login")
        .set("Origin", E2E_ORIGIN)
        .send({ email, password: "senha-errada", rememberMe: false })

    let last = await attempt()
    for (let i = 0; i < 10; i++) {
      last = await attempt()
    }
    return last
  }

  it("estourar o bucket de um e-mail inexistente devolve o MESMO 429 de um existente", async () => {
    const existente = await exhaust(EXISTING)
    const inexistente = await exhaust("nao-existe-nunca@example.com")

    expect(existente.status).toBe(429)
    expect(inexistente.status).toBe(429)
    expect(bodyShape(inexistente.body)).toEqual(bodyShape(existente.body))
    expect(inexistente.headers["retry-after"]).toBe(
      existente.headers["retry-after"]
    )
    expect(JSON.stringify(inexistente.body)).not.toMatch(/lock|verif|exist/i)
  })
})

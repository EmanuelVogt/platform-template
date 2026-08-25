import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { parseEnv } from "../src/shared/config/env"
import { DedicatedClientFactory } from "../src/shared/infra/database/dedicated-client.factory"
import { PG_POOL } from "../src/shared/infra/database/drizzle.provider"
import { createE2eApp } from "../src/shared/test/e2e/app"
import { makeTestLogger } from "../src/shared/test/int/logger"

import type { E2eApp } from "../src/shared/test/e2e/app"
import type { Pool, PoolClient } from "pg"

function bootAppWithUnreachableReadiness(): Promise<E2eApp> {
  const { loggerFactory } = makeTestLogger()
  const unreachable = new DedicatedClientFactory(
    loggerFactory.forModule("teste"),
    parseEnv({
      ...process.env,
      DATABASE_URL: "postgres://u:p@127.0.0.1:1/indisponivel",
    })
  )
  return createE2eApp({
    middleware: "none",
    overrides: [[DedicatedClientFactory, unreachable]],
  })
}

describe("Health + erros (e2e)", () => {
  let e2e: E2eApp

  beforeAll(async () => {
    e2e = await createE2eApp()
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("GET /health → 200 ok", async () => {
    await e2e.http.get("/health").expect(200, { status: "ok" })
  })

  it("GET /ready → 200 ready (contra Postgres real)", async () => {
    await e2e.http.get("/ready").expect(200, { status: "ready" })
  })

  it("GET /ready → 200 mesmo com o pool de aplicação saturado", async () => {
    const pool = e2e.app.get<Pool>(PG_POOL)
    const max = pool.options.max
    const clients: PoolClient[] = []

    try {
      for (let i = 0; i < max; i += 1) {
        clients.push(await pool.connect())
      }
      expect(pool.idleCount).toBe(0)

      await e2e.http.get("/ready").expect(200, { status: "ready" })
    } finally {
      clients.forEach((client) => {
        client.release()
      })
    }
  })

  it("GET /ready → 503 quando o client dedicado do readiness não alcança o banco", async () => {
    const down = await bootAppWithUnreachableReadiness()

    try {
      const res = await down.http.get("/ready")
      expect(res.status).toBe(503)
    } finally {
      await down.close()
    }
  })

  it("rota inexistente → 404 RFC 7807 com correlationId do header", async () => {
    // Só um ULID válido é adotado do header (anti-forja); um valor arbitrário
    // seria descartado em favor de um id gerado.
    const correlationId = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
    const res = await e2e.http
      .get("/v1/nope")
      .set("X-Correlation-Id", correlationId)
      .expect(404)

    expect(res.headers["content-type"]).toContain("application/problem+json")
    expect(res.body.type).toContain("/http/404")
    expect(res.body.status).toBe(404)
    expect(res.body.correlationId).toBe(correlationId)
  })
})

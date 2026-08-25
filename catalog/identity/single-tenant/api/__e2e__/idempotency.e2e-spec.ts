import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { resetDb } from "../../../shared/test/int/db"

import type { E2eApp } from "../../../shared/test/e2e/app"

describe("IdempotencyInterceptor (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    // Rate-limit neutralizado (default do harness): o cap real (3/60s)
    // estouraria com várias chamadas do mesmo IP. O foco aqui são os ramos do
    // interceptor de idempotência.
    e2e = await createE2eApp()
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("sem Idempotency-Key → executa sem dedup (header opcional)", async () => {
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .send({ email: "user@example.com" })
      .expect(202)

    const { rows } = await db.pool.query(
      "SELECT 1 FROM _kernel.idempotency_keys WHERE endpoint = $1",
      ["POST /v1/auth/forgot-password"]
    )
    expect(rows).toHaveLength(0)
  })

  it("com Idempotency-Key → 202", async () => {
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", "idem-202")
      .send({ email: "user@example.com" })
      .expect(202)
  })

  it("replay mesma key+body → 202 idêntico (status do snapshot)", async () => {
    const key = "idem-replay"
    const body = { email: "replay@example.com" }
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(202)
    // 2ª chamada serve do snapshot — status idêntico (prova consistência C4).
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(202)
  })

  it("mesma key + body diferente → 422", async () => {
    const key = "idem-422"
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", key)
      .send({ email: "first@example.com" })
      .expect(202)
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", key)
      .send({ email: "second@example.com" })
      .expect(422)
  })

  it("snapshot não persiste PII em claro no response_body", async () => {
    const key = "idem-redact"
    await e2e.http
      .post("/v1/auth/forgot-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", key)
      .send({ email: "pii@example.com" })
      .expect(202)

    const { rows } = await db.pool.query<{ response_body: unknown }>(
      "SELECT response_body FROM _kernel.idempotency_keys WHERE key = $1",
      [key]
    )

    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0]?.response_body ?? null)).not.toContain(
      "pii@example.com"
    )
  })
})

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { expectProblem } from "../../../shared/test/e2e/problem"
import { resetDb } from "../../../shared/test/int/db"

import type { E2eApp } from "../../../shared/test/e2e/app"

describe("Rate-limit — 429 RFC 7807 (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    // O único e2e que precisa do limiter de verdade: é o comportamento sob teste.
    e2e = await createE2eApp({ rateLimiter: "real" })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("estouro do limite de forgot-password (3/min) responde 429 problem+json", async () => {
    const fire = (i: number) =>
      e2e.http
        .post("/v1/auth/forgot-password")
        .set("Origin", E2E_ORIGIN)
        .set("Idempotency-Key", `forgot-${i}`)
        .send({ email: "rate@example.com" })

    // limite forgot = 3/min — dispara o suficiente p/ estourar (guard 429 vem
    // antes do interceptor de idempotência).
    let last = await fire(0)
    for (let i = 0; i < 6; i++) {
      last = await fire(i + 1)
    }

    expectProblem(last, { status: 429, type: "/too-many-requests" })
    expect(last.headers["retry-after"]).toMatch(/^\d+$/)
    expect(Number(last.headers["retry-after"])).toBeLessThanOrEqual(60)
  })
})

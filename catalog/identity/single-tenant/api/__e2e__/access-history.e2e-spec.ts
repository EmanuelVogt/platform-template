import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { resetDb } from "../../../shared/test/int/db"
import { loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const EMAIL = "access-history@example.com"

describe("Histórico de acesso — GET /auth/access-history (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp()
    await seedUser(e2e.app, db.pool, {
      email: EMAIL,
      name: "Access History",
      password: TEST_PASSWORD,
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("autenticado → 200 com envelope paginado e campos corretos", async () => {
    // o login em si já gera um evento login_success
    const cookies = await loginAs(e2e.http, EMAIL)

    const res = await e2e.http
      .get("/v1/auth/access-history?page=1&pageSize=10")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)

    const { data, page } = res.body as {
      data: Record<string, unknown>[]
      page: {
        total: number
        page: number
        pageSize: number
        totalPages: number
      }
    }

    // envelope de paginação
    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(10)
    expect(typeof page.total).toBe("number")
    expect(typeof page.totalPages).toBe("number")

    // ao menos o login_success do step acima deve constar
    expect(data.length).toBeGreaterThan(0)

    // campos obrigatórios em cada item
    for (const item of data) {
      expect(typeof item.id).toBe("string")
      expect(typeof item.eventType).toBe("string")
      expect(typeof item.createdAt).toBe("string")
      // ipAddress e userAgent podem ser null (supertest não envia header real)
      expect("ipAddress" in item).toBe(true)
      expect("userAgent" in item).toBe(true)

      // campos sensíveis NÃO devem vazar
      expect(item).not.toHaveProperty("emailHash")
      expect(item).not.toHaveProperty("correlationId")
      expect(item).not.toHaveProperty("traceId")
      expect(item).not.toHaveProperty("spanId")
      expect(item).not.toHaveProperty("metadata")
    }
  })

  it("sem cookie → 401", async () => {
    await e2e.http
      .get("/v1/auth/access-history")
      .set("Origin", E2E_ORIGIN)
      .expect(401)
  })
})

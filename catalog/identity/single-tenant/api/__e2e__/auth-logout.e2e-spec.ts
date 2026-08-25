import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader } from "../../../shared/test/e2e/http"
import { resetDb } from "../../../shared/test/int/db"
import { loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const EMAIL = "logout-e2e@example.com"
const SESSION_COOKIE = "rit_session"

describe("Logout — POST /v1/auth/logout (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    e2e = await createE2eApp()
  })

  afterAll(async () => {
    await e2e.close()
  })

  beforeEach(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    await seedUser(e2e.app, db.pool, {
      email: EMAIL,
      name: "Logout E2E",
      password: TEST_PASSWORD,
    })
  })

  it("logout com sessão válida → 204 e cookie de sessão apagado", async () => {
    const cookies = await loginAs(e2e.http, EMAIL)

    const res = await e2e.http
      .post("/v1/auth/logout")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(204)

    expect(res.text).toBe("")

    const joined = cookieHeader(res).join(";")
    expect(joined).toContain(`${SESSION_COOKIE}=;`)
    expect(joined).toMatch(/Max-Age=0/i)
  })

  it("após logout, rota autenticada retorna 401", async () => {
    const cookies = await loginAs(e2e.http, EMAIL)

    await e2e.http
      .post("/v1/auth/logout")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(204)

    await e2e.http
      .get("/v1/auth/session")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(401)
  })

  it("logout sem sessão (cookie ausente) → 401", async () => {
    await e2e.http.post("/v1/auth/logout").set("Origin", E2E_ORIGIN).expect(401)
  })

  it("logout sem Origin → 403 (CSRF guard rejeita por Origin ausente)", async () => {
    const cookies = await loginAs(e2e.http, EMAIL)

    await e2e.http.post("/v1/auth/logout").set("Cookie", cookies).expect(403)
  })
})

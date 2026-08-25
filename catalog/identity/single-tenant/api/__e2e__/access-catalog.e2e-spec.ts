import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { resetDb } from "../../../shared/test/int/db"
import { loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const EMAIL = "access-catalog@example.com"

type AccessCatalogBody = {
  modules: { key: string }[]
  profiles: { key: string; label: string; assignable: boolean }[]
}

describe("Catálogo de acesso — GET /access-catalog (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let cookies: string[]

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    e2e = await createE2eApp()
    await seedUser(e2e.app, db.pool, {
      email: EMAIL,
      name: "Access Catalog",
      password: TEST_PASSWORD,
    })
    cookies = await loginAs(e2e.http, EMAIL)
  })

  afterAll(async () => {
    await e2e.close()
  })

  async function getCatalog(): Promise<AccessCatalogBody> {
    const res = await e2e.http
      .get("/v1/access-catalog")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
    return res.body as AccessCatalogBody
  }

  it("lista os perfis do base-set com rótulo em pt-BR e a marcação de atribuível", async () => {
    const body = await getCatalog()

    expect(body.profiles).toEqual([
      { key: "master", label: "Master", assignable: false },
      { key: "admin", label: "Administrador", assignable: true },
      { key: "professional", label: "Profissional", assignable: true },
    ])
  })

  it("segue devolvendo os módulos do catálogo de permissões", async () => {
    const body = await getCatalog()

    expect(body.modules.map((m) => m.key)).toContain("admin")
  })

  it("sem cookie → 401", async () => {
    await e2e.http
      .get("/v1/access-catalog")
      .set("Origin", E2E_ORIGIN)
      .expect(401)
  })
})

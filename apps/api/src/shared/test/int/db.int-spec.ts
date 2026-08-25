import { afterAll, beforeAll, describe, expect, inject, it } from "vitest"

import { createTestPool, testDatabaseUrl } from "./db"

import type { ApplicationPool } from "../../infra/database/application-pool"

/**
 * Prova do handshake do tier de integração (RUN-02): cada worker fala com o
 * clone `test_w${VITEST_POOL_ID}` e o endereço do container chega por `inject`
 * — nunca por variável de ambiente ou arquivo em disco.
 */
describe("handshake de banco por worker", () => {
  let pool: ApplicationPool

  beforeAll(() => {
    pool = createTestPool({ max: 1 })
  })

  afterAll(async () => {
    await pool.end()
  })

  it("conecta no clone do próprio worker", async () => {
    const poolId = process.env.VITEST_POOL_ID
    // Sem o slot do runner o teste passaria vazio (undefined === undefined).
    expect(poolId).toMatch(/^\d+$/)

    const result = await pool.query<{ db: string }>(
      "SELECT current_database() AS db"
    )

    expect(result.rows[0]?.db).toBe(`test_w${poolId}`)
  })

  it("aponta para o container que o globalSetup publicou", () => {
    const injected = new URL(inject("postgresUri"))
    const target = new URL(testDatabaseUrl())

    expect(target.hostname).toBe(injected.hostname)
    expect(target.port).toBe(injected.port)
    expect(target.pathname).toBe(`/test_w${process.env.VITEST_POOL_ID}`)
  })
})

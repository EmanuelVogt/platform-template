import { afterAll, beforeAll, describe, expect, inject, it } from "vitest"

import { createTestPool, testDatabaseUrl } from "./db"
import { claimWorkerDatabaseIndex, workerDatabaseCount } from "./worker-db"

import type { ApplicationPool } from "../../infra/database/application-pool"

/**
 * Prova do handshake do tier de integração (RUN-02): cada worker fala com o
 * clone que ele mesmo reivindicou em `claimWorkerDatabaseIndex` — a única
 * fonte de verdade, memoizada por processo, que `testDatabaseUrl()` também usa
 * para montar a URL de conexão — e o endereço do container chega por `inject`,
 * nunca por variável de ambiente ou arquivo em disco.
 *
 * O índice esperado NUNCA vem de `VITEST_POOL_ID` direto: como o próprio
 * `worker-db.ts` documenta, o runner reconstrói a free-list desse id a cada
 * fronteira de `sequence.groupOrder` sem sincronizar com os workers vivos, e
 * dois specs podem enxergar o mesmo pool id enquanto reivindicam clones
 * diferentes. Comparar contra o pool id bruto (segunda fonte, heurística) é o
 * que produzia `expected 'test_w4' to be 'test_w3'` — flake dependente da
 * alocação do run, não do banco.
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
    const claimedIndex = claimWorkerDatabaseIndex(
      inject("postgresUri"),
      workerDatabaseCount()
    )

    const result = await pool.query<{ db: string }>(
      "SELECT current_database() AS db"
    )

    expect(result.rows[0]?.db).toBe(`test_w${claimedIndex}`)
  })

  it("aponta para o container que o globalSetup publicou", () => {
    const injected = new URL(inject("postgresUri"))
    const target = new URL(testDatabaseUrl())
    const claimedIndex = claimWorkerDatabaseIndex(
      inject("postgresUri"),
      workerDatabaseCount()
    )

    expect(target.hostname).toBe(injected.hostname)
    expect(target.port).toBe(injected.port)
    expect(target.pathname).toBe(`/test_w${claimedIndex}`)
  })
})

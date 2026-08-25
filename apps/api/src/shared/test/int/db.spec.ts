import { describe, expect, it, vi } from "vitest"

import { resetDb, truncateKernel } from "./db"

import type { Pool } from "pg"

type Query = { text: string; values?: unknown[] }

function fakePool(schemas: string[], tables: [string, string][]): Pool {
  const queries: Query[] = []
  const query = vi.fn((text: string, values?: unknown[]) => {
    queries.push({ text, values })
    if (text.includes("information_schema.schemata")) {
      return Promise.resolve({
        rows: schemas.map((schema_name) => ({ schema_name })),
      })
    }
    if (text.includes("information_schema.tables")) {
      return Promise.resolve({
        rows: tables.map(([schema, table]) => ({ schema, table })),
      })
    }
    return Promise.resolve({ rows: [] })
  })
  return { query, queries } as unknown as Pool & { queries: Query[] }
}

const truncates = (pool: Pool): Query[] =>
  (pool as unknown as { queries: Query[] }).queries.filter((q) =>
    q.text.startsWith("TRUNCATE")
  )

describe("resetDb", () => {
  it("zera todas as tabelas dos schemas pedidos num único TRUNCATE", async () => {
    const pool = fakePool(
      ["_kernel", "public"],
      [
        ["_kernel", "outbox"],
        ["_kernel", "processed_events"],
      ]
    )

    await resetDb(pool, ["_kernel"])

    expect(truncates(pool).map((q) => q.text)).toEqual([
      'TRUNCATE TABLE "_kernel"."outbox", "_kernel"."processed_events" RESTART IDENTITY CASCADE',
    ])
  })

  it("um schema desconhecido lança nomeando o que existe e não trunca nada", async () => {
    const pool = fakePool(["_kernel", "public"], [["_kernel", "outbox"]])

    await expect(resetDb(pool, ["_kernel", "identidade"])).rejects.toThrow(
      "resetDb: schema desconhecido — identidade. Conhecidos: _kernel, public"
    )
    expect(truncates(pool)).toEqual([])
  })

  it("um schema sem tabela nenhuma não emite TRUNCATE", async () => {
    const pool = fakePool(["vazio"], [])

    await resetDb(pool, ["vazio"])

    expect(truncates(pool)).toEqual([])
  })

  it("sem schema nenhum não vai ao banco", async () => {
    const pool = fakePool(["_kernel"], [["_kernel", "outbox"]])

    await resetDb(pool, [])

    expect((pool as unknown as { queries: Query[] }).queries).toEqual([])
  })

  it("repetir o reset do mesmo conjunto reusa o statement, sem reconsultar o catálogo", async () => {
    const pool = fakePool(["_kernel"], [["_kernel", "outbox"]])

    await resetDb(pool, ["_kernel"])
    await resetDb(pool, ["_kernel"])

    const all = (pool as unknown as { queries: Query[] }).queries
    expect(truncates(pool)).toHaveLength(2)
    expect(
      all.filter((q) => q.text.includes("information_schema"))
    ).toHaveLength(2)
  })

  it("truncateKernel é o resetDb do schema do kernel, sem helper por módulo", async () => {
    const pool = fakePool(["_kernel"], [["_kernel", "outbox"]])

    await truncateKernel(pool)

    expect(truncates(pool).map((q) => q.text)).toEqual([
      'TRUNCATE TABLE "_kernel"."outbox" RESTART IDENTITY CASCADE',
    ])
  })
})

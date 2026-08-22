import { pgTable, text } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { DatabaseModule } from "./database.module"
import { DedicatedClientFactory } from "./dedicated-client.factory"
import { createDrizzle, DRIZZLE, PG_POOL } from "./drizzle.provider"

import type {
  DrizzleDb,
  DrizzleExecutor,
  DrizzleSchema,
} from "./drizzle.provider"
import type { FactoryProvider } from "@nestjs/common"

// Tabela de produto que o kernel não conhece: prova que o executor aceita
// qualquer tabela do app, não só as do agregado do kernel.
const demoProduto = pgTable("demo_produto", {
  id: text("id").primaryKey(),
})

const appSchema: DrizzleSchema = { demoProduto }

function drizzleProviderOf(schema: DrizzleSchema): FactoryProvider {
  const providers = DatabaseModule.forRoot({ schema }).providers ?? []
  const found = providers.find(
    (candidate): candidate is FactoryProvider =>
      typeof candidate === "object" &&
      "provide" in candidate &&
      candidate.provide === DRIZZLE
  )
  if (!found) throw new Error("DatabaseModule.forRoot não provê DRIZZLE")
  return found
}

describe("DatabaseModule.forRoot — o schema do app chega ao kernel", () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({ connectionString: "postgres://x:x@127.0.0.1:1/x" })
  })

  afterAll(async () => {
    await pool.end()
  })

  it("monta o DRIZZLE com o schema recebido, e só com ele", () => {
    const comSchema = drizzleProviderOf(appSchema).useFactory(pool) as DrizzleDb
    const semSchema = drizzleProviderOf({}).useFactory(pool) as DrizzleDb

    expect(Object.keys(comSchema.query)).toEqual(["demoProduto"])
    expect(Object.keys(semSchema.query)).toEqual([])
  })

  it("DrizzleExecutor aceita select().from de tabela fora do kernel", () => {
    const executor: DrizzleExecutor = createDrizzle(pool, appSchema)

    expect(executor.select().from(demoProduto).toSQL().sql).toContain(
      '"demo_produto"'
    )
  })

  it("mantém o contrato de injeção do módulo", () => {
    const dynamic = DatabaseModule.forRoot({ schema: appSchema })

    expect(dynamic.module).toBe(DatabaseModule)
    expect(dynamic.exports).toEqual([DRIZZLE, PG_POOL, DedicatedClientFactory])
    expect(drizzleProviderOf(appSchema).inject).toEqual([PG_POOL])
  })
})

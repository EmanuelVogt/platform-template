import { createTestPool } from "../../../../test/setup/test-db"

import { AUDITED, EXEMPT, MODULE_SCHEMAS } from "./audit-coverage"

import type { Pool } from "pg"

/**
 * Enforcement de cobertura da trilha (spec §Cobertura): toda tabela de negócio
 * dos schemas de módulo tem o trigger `audit_row` OU está na allowlist EXEMPT.
 * Tabela nova fora das duas listas quebra este teste — o esquecimento vira
 * vermelho, não silêncio. As listas espelham a migration 0054 e vivem em
 * ./audit-coverage.
 */
describe("audit coverage enforcement (int)", () => {
  let pool: Pool
  let moduleTables: string[]
  let auditedTables: Set<string>

  beforeAll(async () => {
    pool = createTestPool()
    const { rows: tables } = await pool.query<{ schema: string; table: string }>(
      `SELECT table_schema AS schema, table_name AS table
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1)`,
      [[...MODULE_SCHEMAS]]
    )
    moduleTables = tables.map((t) => `${t.schema}.${t.table}`)

    const { rows: triggered } = await pool.query<{
      schema: string
      table: string
    }>(
      `SELECT n.nspname AS schema, c.relname AS table
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE t.tgname = 'audit_row' AND NOT t.tgisinternal`
    )
    auditedTables = new Set(triggered.map((t) => `${t.schema}.${t.table}`))
  })

  afterAll(async () => {
    await pool.end()
  })

  it("toda tabela de schema de módulo está em AUDITED ou EXEMPT (sem órfã)", () => {
    const orphans = moduleTables.filter(
      (t) => !AUDITED.has(t) && !EXEMPT.has(t)
    )
    expect(orphans).toEqual([])
  })

  it("toda tabela AUDITED tem o trigger audit_row no banco", () => {
    const missing = [...AUDITED].filter((t) => !auditedTables.has(t))
    expect(missing).toEqual([])
  })

  it("nenhuma tabela EXEMPT tem o trigger audit_row", () => {
    const wronglyAudited = [...EXEMPT].filter((t) => auditedTables.has(t))
    expect(wronglyAudited).toEqual([])
  })

  it("todo trigger audit_row no banco pertence a uma tabela AUDITED declarada", () => {
    const undeclared = [...auditedTables].filter((t) => !AUDITED.has(t))
    expect(undeclared).toEqual([])
  })
})

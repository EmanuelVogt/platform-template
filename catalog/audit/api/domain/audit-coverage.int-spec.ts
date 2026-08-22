import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestPool } from "../../../../test/setup/test-db"
import {
  detachIdentityTables,
  reattachIdentityTables,
} from "../testing/reattach-identity-tables"
import { detachTagTables, reattachTagTables } from "../testing/reattach-tag-tables"

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
  let installedSchemas: Set<string>
  let auditedTables: Set<string>

  beforeAll(async () => {
    pool = createTestPool()
    // SPEC_DEVIATION: reanexa as tabelas do identity ao trigger antes de medir
    // cobertura. Reason: mesma causa de audit-trigger.int-spec.ts — a
    // migration custom do identity roda antes de `audit.attach` existir num
    // `catalog:check audit`; simula o passo manual que um produto reaplicaria.
    await reattachIdentityTables(pool)
    // SPEC_DEVIATION: reattaches tag.tags before measuring coverage, when the
    // tag entry is installed alongside audit.
    // Reason: same class as the identity block above — tag's custom migration
    // runs before `audit.attach` exists in a child that installs both (install
    // order between the two siblings is not forced by dependsOn), so its guard
    // skips the attach. Both entries document the remedy as a manual re-apply
    // and refuse automatic retro-attach; this simulates that manual step.
    await reattachTagTables(pool)

    const { rows: tables } = await pool.query<{ schema: string; table: string }>(
      `SELECT table_schema AS schema, table_name AS table
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1)`,
      [[...MODULE_SCHEMAS]]
    )
    moduleTables = tables.map((t) => `${t.schema}.${t.table}`)
    installedSchemas = new Set(tables.map((t) => t.schema))

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
    await detachIdentityTables(pool)
    await detachTagTables(pool)
    await pool.end()
  })

  it("toda tabela de schema de módulo está em AUDITED ou EXEMPT (sem órfã)", () => {
    const orphans = moduleTables.filter(
      (t) => !AUDITED.has(t) && !EXEMPT.has(t)
    )
    expect(orphans).toEqual([])
  })

  // SPEC_DEVIATION: filtra AUDITED pelos schemas de módulo instalados antes de
  // checar o trigger. Reason: AUDITED é o registro combinado de todo o
  // "produto final" (comentário da lista: "módulo de produto novo entra aqui
  // junto com a migration") — num `catalog:check <entrada>` standalone, só
  // uma fração dos módulos que a lista cobre está instalada; tabela cujo
  // schema nem existe não é um buraco de cobertura, é módulo não instalado.
  it("toda tabela AUDITED de módulo instalado tem o trigger audit_row no banco", () => {
    const missing = [...AUDITED]
      .filter((t) => installedSchemas.has(t.split(".")[0]!))
      .filter((t) => !auditedTables.has(t))
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

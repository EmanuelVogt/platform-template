import { describe, expect, it, vi } from "vitest"

import { AUDITED } from "../domain/audit-coverage"

import {
  detachAuditHookTables,
  reattachAuditHookTables,
} from "./reattach-audit-hook-tables"

import type { Pool } from "pg"

const PROFESSIONAL_TABLES = [...AUDITED]
  .filter((table) => table.startsWith("professional."))
  .map((table) => table.slice("professional.".length))

const IDENTITY_TABLES = [
  "users",
  "devices",
  "sessions",
  "verification_tokens",
  "permission_templates",
  "permission_template_permissions",
  "user_permissions",
]

function fakePool(): { pool: Pool; statements: string[] } {
  const statements: string[] = []
  const pool = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql)
      return { rows: [] }
    }),
  } as unknown as Pool
  return { pool, statements }
}

describe("reattachAuditHookTables / detachAuditHookTables", () => {
  it("reattach reexecuta o attach_module_hooks() da instalação", async () => {
    const { pool, statements } = fakePool()
    await reattachAuditHookTables(pool)
    expect(statements).toEqual(["SELECT audit.attach_module_hooks()"])
  })

  it("detach continua dropando, incondicional, as sete tabelas do identity", async () => {
    const { pool, statements } = fakePool()
    await detachAuditHookTables(pool)
    const sql = statements.join("\n")
    for (const table of IDENTITY_TABLES) {
      expect(sql).toContain(
        `DROP TRIGGER IF EXISTS audit_row ON identity.${table};`
      )
    }
  })

  it("detach dropa também as tabelas de professional que reattach anexa via attach_module_hooks() — o par fica simétrico", async () => {
    expect(PROFESSIONAL_TABLES.length).toBeGreaterThan(0)

    const { pool, statements } = fakePool()
    await detachAuditHookTables(pool)
    const sql = statements.join("\n")

    // Antes da correção, `detach*` só conhecia as tabelas do identity: esta
    // asserção reprovava, porque nenhuma tabela de professional aparecia na
    // string enviada ao pool — os oito triggers que o reattach anexa
    // sobreviviam sem que nada os removesse.
    for (const table of PROFESSIONAL_TABLES) {
      expect(sql).toContain(
        `DROP TRIGGER IF EXISTS audit_row ON professional.${table}'`
      )
    }
    // O schema `professional` não é `dependsOn` de `audit` — pode não existir
    // no banco — então o drop das oito é guardado, ao contrário do identity.
    expect(sql).toContain("to_regnamespace('professional')")
  })
})

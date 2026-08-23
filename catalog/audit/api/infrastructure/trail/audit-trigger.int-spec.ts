import { sql } from "drizzle-orm"
import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { RequestContext, type RequestContextStore } from "../../../../shared/kernel/context/request-context"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import {
  detachIdentityTables,
  reattachIdentityTables,
} from "../../testing/reattach-identity-tables"

import type { Pool } from "pg"

/**
 * Valida a captura genérica por trigger (migration 0003_audit_trail): insert/update/delete,
 * supressão de no-op, exclusão de updated_at, redaction, PK composta, escape
 * hatch append-only e o carimbo de contexto do ator via TransactionManager.
 */
describe("audit trigger (int)", () => {
  let pool: Pool
  let db: ReturnType<typeof createTestDb>

  beforeAll(async () => {
    pool = createTestPool()
    db = createTestDb(pool)
    // Reexecuta o passo de instalação do audit (`audit.attach_module_hooks()`),
    // idempotente: a instalação já anexou as tabelas do identity com as listas
    // de redação declaradas em `04_audit_attach_hook.sql`, mas o `afterAll` das
    // outras suítes de audit desanexa os triggers e o banco do `test:db` é
    // compartilhado entre arquivos.
    await reattachIdentityTables(pool)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
    // audit.entries é append-only, mas TRUNCATE não dispara o trigger de mutação
    // e o superuser do container retém o privilégio (REVOKE só atinge a role da app).
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
  })

  afterAll(async () => {
    await detachIdentityTables(pool)
    await pool.end()
  })

  async function auditRows(table: string): Promise<Record<string, unknown>[]> {
    const { rows } = await pool.query(
      "SELECT * FROM audit.entries WHERE table_name = $1 ORDER BY seq",
      [table]
    )
    return rows
  }

  // SPEC_DEVIATION: veículo trocado de tag.tags para identity.permission_templates.
  // Reason: audit não depende de tag (siblings sob identity) — um
  // `catalog:check audit` standalone nunca tem o schema "tag". O mecanismo
  // testado aqui é o trigger genérico (attach em qualquer tabela); a garantia
  // real do que muda de disco pertence a Deviation-style Fixed em base-audit-
  // registrations.ts/audit-coverage.ts, não a esta suíte.
  async function insertTemplate(id: string, name: string): Promise<void> {
    await pool.query(
      `INSERT INTO identity.permission_templates (id, name, created_at, updated_at)
       VALUES ($1, $2, now(), now())`,
      [id, name]
    )
  }

  // FK das tabelas de credencial (sessions/devices/verification_tokens) — dono
  // precisa existir antes de exercitar a redação dos hashes (REM-40).
  async function insertUser(id: string): Promise<void> {
    await pool.query(
      "INSERT INTO identity.users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
      [id, "Fulano", `${id}@test.local`, "hash-secreto-real"]
    )
  }

  it("INSERT grava op=insert, row_new completo, changed_keys vazio e origin unknown sem contexto", async () => {
    const id = ulid()
    await insertTemplate(id, "Óleo essencial")

    const rows = await auditRows("permission_templates")
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row!.op).toBe("insert")
    expect(row!.schema_name).toBe("identity")
    expect(row!.entity_id).toBe(id)
    expect((row!.row_new as { name: string }).name).toBe("Óleo essencial")
    expect(row!.row_old).toBeNull()
    expect(row!.changed_keys).toEqual([])
    expect(row!.origin).toBe("unknown")
    expect(row!.actor_user_id).toBeNull()
    expect(row!.tx_id).not.toBeNull()
  })

  it("UPDATE grava changed_keys só do campo mudado, excluindo updated_at", async () => {
    const id = ulid()
    await insertTemplate(id, "Antes")
    await pool.query(
      "UPDATE identity.permission_templates SET name = $2, updated_at = now() WHERE id = $1",
      [id, "Depois"]
    )

    const rows = await auditRows("permission_templates")
    const update = rows.find((r) => r.op === "update")!
    expect(update).toBeDefined()
    expect(update.changed_keys).toEqual(["name"])
    expect((update.row_old as { name: string }).name).toBe("Antes")
    expect((update.row_new as { name: string }).name).toBe("Depois")
  })

  it("no-op UPDATE (só updated_at muda) é suprimido", async () => {
    const id = ulid()
    await insertTemplate(id, "Igual")
    await pool.query(
      "UPDATE identity.permission_templates SET updated_at = now() WHERE id = $1",
      [id]
    )

    const rows = await auditRows("permission_templates")
    expect(rows.filter((r) => r.op === "update")).toHaveLength(0)
    expect(rows).toHaveLength(1)
  })

  it("DELETE grava op=delete, row_old completo e row_new null", async () => {
    const id = ulid()
    await insertTemplate(id, "Some")
    await pool.query("DELETE FROM identity.permission_templates WHERE id = $1", [id])

    const rows = await auditRows("permission_templates")
    const del = rows.find((r) => r.op === "delete")!
    expect(del).toBeDefined()
    expect((del.row_old as { name: string }).name).toBe("Some")
    expect(del.row_new).toBeNull()
  })

  it("redaction: identity.users.password_hash vira [REDACTED] na trilha", async () => {
    const id = ulid()
    await pool.query(
      "INSERT INTO identity.users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
      [id, "Fulano", `${id}@test.local`, "hash-secreto-real"]
    )

    const rows = await auditRows("users")
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect((row!.row_new as { password_hash: string }).password_hash).toBe("[REDACTED]")
    expect((row!.row_new as { email: string }).email).toBe(`${id}@test.local`)
  })

  it("redaction: identity.sessions.token_hash vira [REDACTED] na trilha", async () => {
    const userId = ulid()
    await insertUser(userId)
    const sessionId = ulid()
    await pool.query(
      `INSERT INTO identity.sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 day')`,
      [sessionId, userId, "token-secreto-real"]
    )

    const rows = await auditRows("sessions")
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect((row!.row_new as { token_hash: string }).token_hash).toBe("[REDACTED]")
    expect((row!.row_new as { user_id: string }).user_id).toBe(userId)
  })

  it("redaction: identity.devices.cookie_token_hash vira [REDACTED] na trilha", async () => {
    const userId = ulid()
    await insertUser(userId)
    const deviceId = ulid()
    await pool.query(
      `INSERT INTO identity.devices (id, user_id, cookie_token_hash)
       VALUES ($1, $2, $3)`,
      [deviceId, userId, "cookie-secreto-real"]
    )

    const rows = await auditRows("devices")
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect((row!.row_new as { cookie_token_hash: string }).cookie_token_hash).toBe("[REDACTED]")
    expect((row!.row_new as { user_id: string }).user_id).toBe(userId)
  })

  it("redaction: identity.verification_tokens.token_hash vira [REDACTED] na trilha", async () => {
    const userId = ulid()
    await insertUser(userId)
    const tokenId = ulid()
    await pool.query(
      `INSERT INTO identity.verification_tokens (id, user_id, type, token_hash, expires_at)
       VALUES ($1, $2, 'email_verify', $3, now() + interval '1 day')`,
      [tokenId, userId, "token-secreto-real"]
    )

    const rows = await auditRows("verification_tokens")
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect((row!.row_new as { token_hash: string }).token_hash).toBe("[REDACTED]")
    expect((row!.row_new as { user_id: string }).user_id).toBe(userId)
  })

  it("PK composta: entity_id junta os valores das colunas de PK com ':'", async () => {
    const templateId = ulid()
    await pool.query(
      "INSERT INTO identity.permission_templates (id, name) VALUES ($1, $2)",
      [templateId, "Template X"]
    )
    await pool.query(
      "INSERT INTO identity.permission_template_permissions (template_id, permission) VALUES ($1, $2)",
      [templateId, "admin.tags.read"]
    )

    const rows = await auditRows("permission_template_permissions")
    expect(rows).toHaveLength(1)
    expect(rows[0]!.entity_id).toBe(`${templateId}:admin.tags.read`)
  })

  it("escape hatch: DELETE em audit.entries lança sem GUC e passa com app.audit_maintenance=on", async () => {
    const id = ulid()
    await insertTemplate(id, "Alvo")
    const seq = (await auditRows("permission_templates"))[0]!.seq

    await expect(
      pool.query("DELETE FROM audit.entries WHERE seq = $1", [seq])
    ).rejects.toThrow()

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.audit_maintenance', 'on', true)")
      await client.query("DELETE FROM audit.entries WHERE seq = $1", [seq])
      await client.query("COMMIT")
    } finally {
      client.release()
    }
    expect(await auditRows("permission_templates")).toHaveLength(0)
  })

  it("UPDATE em audit.entries sempre lança (append-only), mesmo com GUC", async () => {
    const id = ulid()
    await insertTemplate(id, "X")
    const seq = (await auditRows("permission_templates"))[0]!.seq

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.audit_maintenance', 'on', true)")
      await expect(
        client.query("UPDATE audit.entries SET origin = 'hacked' WHERE seq = $1", [seq])
      ).rejects.toThrow()
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
  })

  it("contexto do ator: TransactionManager carimba actor_user_id, origin e correlation_id", async () => {
    const rc = new RequestContext()
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory, rc)
    const templateId = ulid()
    const store: RequestContextStore = {
      requestId: ulid(),
      correlationId: "CORR-ATOR",
      causationId: null,
      traceId: null,
      spanId: null,
      tenantId: null,
      origin: "http",
      actor: { id: "actor-1", kind: "user" },
      extensions: new Map(),
      locale: "pt-BR",
      ip: null,
      userAgent: null,
      startedAt: 0,
    }

    await rc.run(store, () =>
      txm.run(async () => {
        await txm
          .getExecutor()
          .execute(
            sql`INSERT INTO identity.permission_templates (id, name, created_at, updated_at) VALUES (${templateId}, ${"Com ator"}, now(), now())`
          )
      })
    )

    const rows = await auditRows("permission_templates")
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actor_user_id).toBe("actor-1")
    expect(rows[0]!.origin).toBe("http")
    expect(rows[0]!.correlation_id).toBe("CORR-ATOR")
  })

  it("app.audit_skip=on suprime a captura na transação", async () => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.audit_skip', 'on', true)")
      await client.query(
        `INSERT INTO identity.permission_templates (id, name, created_at, updated_at)
         VALUES ($1, 'Fantasma', now(), now())`,
        [ulid()]
      )
      await client.query("COMMIT")
    } finally {
      client.release()
    }
    expect(await auditRows("permission_templates")).toHaveLength(0)
  })
})

import { sql } from "drizzle-orm"
import { ulid } from "ulid"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
  truncateTag,
} from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { RequestContext, type RequestContextStore } from "../context/request-context"
import { TransactionManager } from "../transactional/transaction-manager"

import type { Pool } from "pg"

/**
 * Valida a captura genérica por trigger (migration 0003_audit_trail): insert/update/delete,
 * supressão de no-op, exclusão de updated_at, redaction, PK composta, escape
 * hatch append-only e o carimbo de contexto do ator via TransactionManager.
 */
describe("audit trigger (int)", () => {
  let pool: Pool
  let db: ReturnType<typeof createTestDb>

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
  })

  beforeEach(async () => {
    await truncateTag(pool)
    await truncateIdentity(pool)
    // audit.entries é append-only, mas TRUNCATE não dispara o trigger de mutação
    // e o superuser do container retém o privilégio (REVOKE só atinge a role da app).
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
  })

  afterAll(async () => {
    await pool.end()
  })

  async function auditRows(table: string): Promise<Record<string, unknown>[]> {
    const { rows } = await pool.query(
      "SELECT * FROM audit.entries WHERE table_name = $1 ORDER BY seq",
      [table]
    )
    return rows
  }

  async function insertTag(id: string, name: string): Promise<void> {
    await pool.query(
      `INSERT INTO tag.tags (id, name, created_at, updated_at)
       VALUES ($1, $2, now(), now())`,
      [id, name]
    )
  }

  it("INSERT grava op=insert, row_new completo, changed_keys vazio e origin unknown sem contexto", async () => {
    const id = ulid()
    await insertTag(id, "Óleo essencial")

    const rows = await auditRows("tags")
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row!.op).toBe("insert")
    expect(row!.schema_name).toBe("tag")
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
    await insertTag(id, "Antes")
    await pool.query(
      "UPDATE tag.tags SET name = $2, updated_at = now() WHERE id = $1",
      [id, "Depois"]
    )

    const rows = await auditRows("tags")
    const update = rows.find((r) => r.op === "update")!
    expect(update).toBeDefined()
    expect(update.changed_keys).toEqual(["name"])
    expect((update.row_old as { name: string }).name).toBe("Antes")
    expect((update.row_new as { name: string }).name).toBe("Depois")
  })

  it("no-op UPDATE (só updated_at muda) é suprimido", async () => {
    const id = ulid()
    await insertTag(id, "Igual")
    await pool.query(
      "UPDATE tag.tags SET updated_at = now() WHERE id = $1",
      [id]
    )

    const rows = await auditRows("tags")
    expect(rows.filter((r) => r.op === "update")).toHaveLength(0)
    expect(rows).toHaveLength(1)
  })

  it("DELETE grava op=delete, row_old completo e row_new null", async () => {
    const id = ulid()
    await insertTag(id, "Some")
    await pool.query("DELETE FROM tag.tags WHERE id = $1", [id])

    const rows = await auditRows("tags")
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
    await insertTag(id, "Alvo")
    const seq = (await auditRows("tags"))[0]!.seq

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
    expect(await auditRows("tags")).toHaveLength(0)
  })

  it("UPDATE em audit.entries sempre lança (append-only), mesmo com GUC", async () => {
    const id = ulid()
    await insertTag(id, "X")
    const seq = (await auditRows("tags"))[0]!.seq

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
    const tagId = ulid()
    const store: RequestContextStore = {
      requestId: ulid(),
      correlationId: "CORR-ATOR",
      causationId: null,
      traceId: null,
      spanId: null,
      tenantId: null,
      origin: "http",
      userId: "actor-1",
      sessionId: null,
      deviceId: null,
      access: null,
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
            sql`INSERT INTO tag.tags (id, name, created_at, updated_at) VALUES (${tagId}, ${"Com ator"}, now(), now())`
          )
      })
    )

    const rows = await auditRows("tags")
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
        `INSERT INTO tag.tags (id, name, created_at, updated_at)
         VALUES ($1, 'Fantasma', now(), now())`,
        [ulid()]
      )
      await client.query("COMMIT")
    } finally {
      client.release()
    }
    expect(await auditRows("tags")).toHaveLength(0)
  })
})

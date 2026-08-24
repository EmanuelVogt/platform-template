import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { ulid } from "ulid"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateAttachment,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Attachment } from "../../domain/attachment.entity"

import { DrizzleAttachmentRepository } from "./drizzle-attachment.repository"

import type { Pool } from "pg"

const MIGRATIONS_DIR = join(__dirname, "../../../../../drizzle/migrations")

// SPEC_DEVIATION: acha o arquivo pelo sufixo em vez do número fixo "0005".
// Reason: a numeração de customMigrations é sequencial pela ordem de install
// do child (kernel/notification/identity antes de attachment), não fixa —
// só o sufixo depois do <seq>_<entry>_ é estável (module.json.customMigrations
// "01_generic_upload_profiles.sql" vira "<seq>_attachment_generic_upload_profiles.sql").
function findMigration0005Path(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith("_attachment_generic_upload_profiles.sql")
  )
  if (!file) {
    throw new Error(
      "migração 0005 (generic_upload_profiles) não encontrada em drizzle/migrations"
    )
  }
  return join(MIGRATIONS_DIR, file)
}

describe("DrizzleAttachmentRepository", () => {
  let pool: Pool
  let repo: DrizzleAttachmentRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const tx = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleAttachmentRepository(tx)
  })

  afterEach(async () => {
    await truncateAttachment(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("insert grava attachment + acl 1:1 e findById remonta a entidade", async () => {
    const a = Attachment.create({
      storageKey: "attachments/k1",
      contentType: "image/png",
      sizeBytes: 123,
      checksum: "abc",
      originalFilename: "x.png",
      profile: "avatar",
      visibility: "restricted",
      ownerUserId: "u-1",
    })
    await repo.insert(a)

    const found = await repo.findById(a.props.id)
    expect(found?.props.visibility).toBe("restricted")
    expect(found?.props.ownerUserId).toBe("u-1")
    expect(found?.props.storageKey).toBe("attachments/k1")
    expect(found?.props.profile).toBe("avatar")
  })

  it("findById retorna null quando não existe", async () => {
    expect(await repo.findById("nope")).toBeNull()
  })

  it("update soft-delete altera status", async () => {
    const a = Attachment.create({
      storageKey: "attachments/k2",
      contentType: "image/png",
      sizeBytes: 1,
      checksum: "z",
      originalFilename: null,
      profile: "avatar",
      visibility: "authenticated",
      ownerUserId: null,
    })
    await repo.insert(a)
    await repo.update(a.markDeleted())
    expect((await repo.findById(a.props.id))?.props.status).toBe("deleted")
  })

  it("insertMany grava pendentes e findPendingOlderThan devolve só os antigos", async () => {
    const old = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 10,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    const fresh = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 10,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    await repo.insertMany([old, fresh])
    await pool.query(
      `UPDATE attachment.attachments SET created_at = now() - interval '48 hours' WHERE id = $1`,
      [old.props.id]
    )

    const stale = await repo.findPendingOlderThan(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    )

    expect(stale.map((a) => a.props.id)).toEqual([old.props.id])
  })

  it("migração 0005 renomeia linhas de profile feedback-attachment para multi", async () => {
    const id = ulid()
    const now = new Date()
    await pool.query(
      `INSERT INTO attachment.attachments
         (id, storage_key, content_type, size_bytes, original_filename, profile, owner_user_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'feedback-attachment', $6, 'ready', $7, $7)`,
      [id, `attachments/${id}`, "application/pdf", 10, null, "user-1", now]
    )
    await pool.query(
      `INSERT INTO attachment.attachment_acls (attachment_id, visibility, created_at, updated_at)
       VALUES ($1, 'restricted', $2, $2)`,
      [id, now]
    )

    await pool.query(readFileSync(findMigration0005Path(), "utf-8"))

    const found = await repo.findById(id)
    expect(found?.props.profile).toBe("multi")
  })

  it("sumPendingBytesByOwner soma só os pendentes do dono, ignora prontos e de outro dono", async () => {
    const pendingA = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 100,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "owner-1",
    })
    const pendingB = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 50,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "owner-1",
    })
    const readyOwner1 = Attachment.create({
      storageKey: "attachments/ready-owner1",
      contentType: "image/png",
      sizeBytes: 999,
      checksum: "z",
      originalFilename: null,
      profile: "avatar",
      visibility: "restricted",
      ownerUserId: "owner-1",
    })
    const pendingOtherOwner = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 777,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "owner-2",
    })
    await repo.insertMany([pendingA, pendingB, pendingOtherOwner])
    await repo.insert(readyOwner1)

    expect(await repo.sumPendingBytesByOwner("owner-1")).toBe(150)
    expect(await repo.sumPendingBytesByOwner("owner-2")).toBe(777)
  })

  it("sumPendingBytesByOwner devolve 0 quando o dono não tem pendente", async () => {
    expect(await repo.sumPendingBytesByOwner("sem-pendente")).toBe(0)
  })

  it("deletePendingByIds só apaga quem ainda está pending — linha que virou ready sobrevive", async () => {
    const stillPending = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 10,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    const turnedReady = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 10,
      originalFilename: null,
      profile: "multi",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    await repo.insertMany([stillPending, turnedReady])
    // Simula a corrida: confirmUploads mudou o status pra 'ready' entre a
    // seleção do job (findPendingOlderThan) e o delete.
    await pool.query(
      `UPDATE attachment.attachments SET status = 'ready' WHERE id = $1`,
      [turnedReady.props.id]
    )

    await repo.deletePendingByIds([stillPending.props.id, turnedReady.props.id])

    expect(await repo.findById(stillPending.props.id)).toBeNull()
    expect((await repo.findById(turnedReady.props.id))?.props.status).toBe(
      "ready"
    )
  })
})


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
      profile: "feedback-attachment",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    const fresh = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 10,
      originalFilename: null,
      profile: "feedback-attachment",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    await repo.insertMany([old, fresh])
    await pool.query(
      `UPDATE attachment.attachments SET created_at = now() - interval '48 hours' WHERE id = $1`,
      [old.props.id],
    )

    const stale = await repo.findPendingOlderThan(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    )

    expect(stale.map((a) => a.props.id)).toEqual([old.props.id])
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateTag,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Tag } from "../../domain/entities/tag.entity"
import { TagConflictError } from "../../domain/errors"

import { DrizzleTagRepository } from "./drizzle-tag.repository"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { Pool } from "pg"

const NOW = new Date("2026-07-27T10:00:00.000Z")

describe("DrizzleTagRepository (int)", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzleTagRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleTagRepository(txm)
  })

  beforeEach(async () => {
    await truncateTag(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("insert + findViewById faz round-trip", async () => {
    const tag = Tag.create({ name: "Relaxante", color: "#aabbcc" })
    await repo.insert(tag)

    const view = await repo.findViewById(tag.props.id)
    expect(view?.name).toBe("Relaxante")
    expect(view?.color).toBe("#aabbcc")
    expect(view?.isActive).toBe(true)
    expect(view?.deletedAt).toBeNull()
  })

  it("nome duplicado entre tags vivas → TagConflictError", async () => {
    await repo.insert(Tag.create({ name: "Facial" }))
    await expect(repo.insert(Tag.create({ name: "facial" }))).rejects.toThrow(
      TagConflictError
    )
  })

  it("existingLiveIds oculta tag na lixeira", async () => {
    const live = Tag.create({ name: "Viva" })
    const trashed = Tag.create({ name: "Arquivada" })
    await repo.insert(live)
    await repo.insert(trashed)
    await repo.save(trashed.stash(NOW))

    const found = await repo.existingLiveIds([live.props.id, trashed.props.id])
    expect([...found]).toEqual([live.props.id])
  })

  it("describeByIds devolve nome e cor só das tags vivas", async () => {
    const live = Tag.create({ name: "Viva", color: "#112233" })
    const trashed = Tag.create({ name: "Arquivada" })
    await repo.insert(live)
    await repo.insert(trashed)
    await repo.save(trashed.stash(NOW))

    const described = await repo.describeByIds([
      live.props.id,
      trashed.props.id,
    ])
    expect(described.get(live.props.id)).toEqual({
      id: live.props.id,
      name: "Viva",
      color: "#112233",
    })
    expect(described.has(trashed.props.id)).toBe(false)
  })

  it("list devolve a tag viva com a paginação preenchida", async () => {
    await repo.insert(Tag.create({ name: "Sozinha" }))

    const { data, page } = await repo.list({ page: 1, pageSize: 20 })
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ name: "Sozinha", isActive: true })
    expect(page.total).toBe(1)
  })
})

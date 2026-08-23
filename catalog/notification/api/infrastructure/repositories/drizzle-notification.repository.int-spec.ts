import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Notification } from "../../domain/entities/notification.entity"

import { DrizzleNotificationRepository } from "./drizzle-notification.repository"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { Pool } from "pg"

describe("DrizzleNotificationRepository (int)", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzleNotificationRepository

  const mk = (recipientId: string, type = "password_changed") =>
    Notification.create({
      recipientId,
      type,
      title: "t",
      body: "b",
      actions: [],
      metadata: { at: "2026-06-10T00:00:00.000Z" },
      locale: "pt-BR",
    })

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleNotificationRepository(txm)
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(async () => {
    await pool.query("truncate table notification.notifications")
  })

  it("insert + findByIdForRecipient roundtrip; id alheio → null", async () => {
    const n = mk("u1")
    await repo.insert(n)
    const found = await repo.findByIdForRecipient(n.props.id, "u1")
    expect(found?.props).toMatchObject({
      id: n.props.id,
      recipientId: "u1",
      title: "t",
      seenAt: null,
    })
    expect(await repo.findByIdForRecipient(n.props.id, "u2")).toBeNull()
  })

  it("list aplica filtro de lifecycle e pagina por offset", async () => {
    const a = mk("u1")
    const b = mk("u1").markRead(new Date())
    const c = mk("u1").archive(new Date())
    await repo.insert(a)
    await repo.insert(b)
    await repo.insert(c)
    await repo.insert(mk("u2"))

    const inbox = await repo.list("u1", { page: 1, pageSize: 10 })
    expect(inbox.total).toBe(2)
    const unread = await repo.list("u1", { page: 1, pageSize: 10, filter: "unread" })
    expect(unread.data.map((n) => n.props.id)).toEqual([a.props.id])
    const read = await repo.list("u1", { page: 1, pageSize: 10, filter: "read" })
    expect(read.data.map((n) => n.props.id)).toEqual([b.props.id])
    const archived = await repo.list("u1", { page: 1, pageSize: 10, filter: "archived" })
    expect(archived.data.map((n) => n.props.id)).toEqual([c.props.id])
    const all = await repo.list("u1", { page: 1, pageSize: 10, filter: "all" })
    expect(all.total).toBe(3)
  })

  it("countUnseen conta só não-vistas não-arquivadas do recipient", async () => {
    await repo.insert(mk("u1"))
    await repo.insert(mk("u1").markSeen(new Date()))
    await repo.insert(mk("u1").archive(new Date()))
    await repo.insert(mk("u2"))
    expect(await repo.countUnseen("u1")).toBe(1)
  })

  it("markAllSeen zera o badge sem tocar read; markAllRead implica seen", async () => {
    const n1 = mk("u1")
    const n2 = mk("u1")
    await repo.insert(n1)
    await repo.insert(n2)
    const at = new Date()
    expect(await repo.markAllSeen("u1", at)).toBe(2)
    expect(await repo.countUnseen("u1")).toBe(0)
    const afterSeen = await repo.findByIdForRecipient(n1.props.id, "u1")
    expect(afterSeen?.props.readAt).toBeNull()

    expect(await repo.markAllRead("u1", at)).toBe(2)
    const afterRead = await repo.findByIdForRecipient(n1.props.id, "u1")
    expect(afterRead?.props.readAt).not.toBeNull()
    expect(afterRead?.props.seenAt).not.toBeNull()
  })

  it("update persiste transição da entidade", async () => {
    const n = mk("u1")
    await repo.insert(n)
    await repo.update(n.markRead(new Date("2026-06-10T01:00:00Z")))
    const found = await repo.findByIdForRecipient(n.props.id, "u1")
    expect(found?.props.readAt?.toISOString()).toBe("2026-06-10T01:00:00.000Z")
  })
})

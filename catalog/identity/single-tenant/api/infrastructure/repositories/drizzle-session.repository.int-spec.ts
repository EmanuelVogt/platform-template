import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Device } from "../../domain/entities/device.entity"
import { Session } from "../../domain/entities/session.entity"
import { User } from "../../domain/entities/user.entity"

import { DrizzleDeviceRepository } from "./drizzle-device.repository"
import { DrizzleSessionRepository } from "./drizzle-session.repository"
import { DrizzleUserRepository } from "./drizzle-user.repository"

import type { Pool } from "pg"

describe("DrizzleSessionRepository (int)", () => {
  let pool: Pool
  let sessions: DrizzleSessionRepository
  let usersRepo: DrizzleUserRepository
  let deviceRepo: DrizzleDeviceRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    sessions = new DrizzleSessionRepository(txm)
    usersRepo = new DrizzleUserRepository(txm)
    deviceRepo = new DrizzleDeviceRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedUser(email: string): Promise<string> {
    const u = User.createActive({
      name: "U",
      email,
      passwordHash: "$argon2id$x",
      pepperVersion: 1,
    })
    await usersRepo.insert(u)
    return u.props.id
  }

  function makeSession(userId: string): Session {
    const now = new Date()
    return Session.create({
      userId,
      tokenHash: ulid() + ulid(),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
      rememberMe: false,
      ipAddress: "203.0.113.1",
      userAgent: "jest",
      deviceId: null,
    })
  }

  it("touch abaixo do intervalo não grava; a partir dele grava", async () => {
    const uid = await seedUser("touch@example.com")
    const created = new Date("2026-05-30T00:00:00.000Z")
    const session = Session.fromProps({
      ...makeSession(uid).props,
      createdAt: created,
      lastSeenAt: created,
      expiresAt: new Date(created.getTime() + 3_600_000),
    })
    await sessions.create(session)

    // 30 s depois, com intervalo de 60 s: a linha não é tocada.
    const tooSoon = new Date(created.getTime() + 30_000)
    await sessions.touch(
      session.props.id,
      tooSoon,
      new Date(tooSoon.getTime() + 3_600_000),
      new Date(tooSoon.getTime() - 60_000)
    )
    const untouched = await sessions.findByTokenHash(session.props.tokenHash)
    expect(untouched?.props.lastSeenAt).toEqual(created)

    // 60 s depois: grava lastSeenAt e expiresAt.
    const due = new Date(created.getTime() + 60_000)
    const nextExpiresAt = new Date(due.getTime() + 3_600_000)
    await sessions.touch(
      session.props.id,
      due,
      nextExpiresAt,
      new Date(due.getTime() - 60_000)
    )
    const touched = await sessions.findByTokenHash(session.props.tokenHash)
    expect(touched?.props.lastSeenAt).toEqual(due)
    expect(touched?.props.expiresAt).toEqual(nextExpiresAt)
  })

  it("deleteById de sessão de OUTRO dono retorna 0 (anti-IDOR)", async () => {
    const owner = await seedUser("owner@example.com")
    const attacker = await seedUser("attacker@example.com")
    const victimSession = makeSession(owner)
    await sessions.create(victimSession)

    const removed = await sessions.deleteById(victimSession.props.id, attacker)
    expect(removed).toBe(0)

    const stillThere = await sessions.findByTokenHash(
      victimSession.props.tokenHash
    )
    expect(stillThere).not.toBeNull()
  })

  it("deleteById do próprio dono retorna 1", async () => {
    const owner = await seedUser("o2@example.com")
    const s = makeSession(owner)
    await sessions.create(s)
    expect(await sessions.deleteById(s.props.id, owner)).toBe(1)
  })

  it("deleteOthers preserva a sessão corrente e remove as demais", async () => {
    const uid = await seedUser("multi@example.com")
    const a = makeSession(uid)
    const b = makeSession(uid)
    const current = makeSession(uid)
    await sessions.create(a)
    await sessions.create(b)
    await sessions.create(current)

    await sessions.deleteOthers(uid, current.props.id)

    const left = await sessions.listByUser(uid)
    expect(left).toHaveLength(1)
    expect(left[0]?.props.id).toBe(current.props.id)
  })

  it("deleteOldestOverCap remove as mais antigas além do cap", async () => {
    const uid = await seedUser("cap@example.com")
    const created: string[] = []
    for (let i = 0; i < 3; i++) {
      const s = makeSession(uid)
      // createdAt crescente para ordenar do mais antigo ao mais novo.
      const ordered = Session.fromProps({
        ...s.props,
        createdAt: new Date(Date.now() + i * 1000),
      })
      await sessions.create(ordered)
      created.push(ordered.props.id)
    }
    await sessions.deleteOldestOverCap(uid, 2)
    const left = await sessions.listByUser(uid)
    expect(left).toHaveLength(2)
    // O mais antigo (created[0]) deve ter sido removido.
    expect(left.map((s) => s.props.id)).not.toContain(created[0])
  })

  it("deleteByDevice remove só as sessões do device alvo", async () => {
    const uid = await seedUser("by-device@example.com")
    const target = Device.create({ userId: uid, cookieTokenHash: "h1" })
    const other = Device.create({ userId: uid, cookieTokenHash: "h2" })
    await deviceRepo.create(target)
    await deviceRepo.create(other)
    const onTarget = Session.fromProps({
      ...makeSession(uid).props,
      deviceId: target.props.id,
    })
    const onOther = Session.fromProps({
      ...makeSession(uid).props,
      deviceId: other.props.id,
    })
    const orphan = makeSession(uid)
    await sessions.create(onTarget)
    await sessions.create(onOther)
    await sessions.create(orphan)

    await sessions.deleteByDevice(target.props.id)

    const left = await sessions.listByUser(uid)
    expect(left.map((s) => s.props.id).sort()).toEqual(
      [onOther.props.id, orphan.props.id].sort()
    )
  })

  it("persiste e hidrata deviceId; cascade do device some com a sessão", async () => {
    const uid = await seedUser("dev-cascade@example.com")
    const dev = Device.create({ userId: uid, cookieTokenHash: "h" })
    await deviceRepo.create(dev)
    const withDevice = Session.fromProps({
      ...makeSession(uid).props,
      deviceId: dev.props.id,
    })
    await sessions.create(withDevice)

    const loaded = await sessions.findByTokenHash(withDevice.props.tokenHash)
    expect(loaded?.props.deviceId).toBe(dev.props.id)

    await deviceRepo.deleteById(dev.props.id, uid)
    expect(await sessions.listByUser(uid)).toHaveLength(0)
  })
})

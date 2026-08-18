import { ulid } from "ulid"

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

describe("DrizzleDeviceRepository (int)", () => {
  let pool: Pool
  let devices: DrizzleDeviceRepository
  let sessionsRepo: DrizzleSessionRepository
  let usersRepo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    devices = new DrizzleDeviceRepository(txm)
    sessionsRepo = new DrizzleSessionRepository(txm)
    usersRepo = new DrizzleUserRepository(txm)
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

  function makeSession(
    userId: string,
    deviceId: string,
    opts: { createdAt?: Date; lastSeenAt?: Date; ip?: string; ua?: string } = {}
  ): Session {
    const now = new Date()
    return Session.create({
      userId,
      tokenHash: ulid() + ulid(),
      createdAt: opts.createdAt ?? now,
      lastSeenAt: opts.lastSeenAt ?? now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 3_600_000),
      rememberMe: false,
      ipAddress: opts.ip ?? null,
      userAgent: opts.ua ?? null,
      deviceId,
    })
  }

  it("respeita unique (user_id, cookie_token_hash)", async () => {
    const userId = await seedUser("u-unique@example.com")
    await devices.create(Device.create({ userId, cookieTokenHash: "h1" }))
    await expect(
      devices.create(Device.create({ userId, cookieTokenHash: "h1" }))
    ).rejects.toThrow()
  })

  it("findByUserAndCookieHash escopa por user", async () => {
    const a = await seedUser("a-scope@example.com")
    const b = await seedUser("b-scope@example.com")
    await devices.create(Device.create({ userId: a, cookieTokenHash: "shared" }))
    expect(await devices.findByUserAndCookieHash(a, "shared")).not.toBeNull()
    expect(await devices.findByUserAndCookieHash(b, "shared")).toBeNull()
  })

  it("listActiveByUser agrega só sessões ativas, com ip/ua da mais recente e count", async () => {
    const userId = await seedUser("active@example.com")
    const dev = Device.create({ userId, cookieTokenHash: "h" })
    await devices.create(dev)
    const now = new Date("2026-06-01T12:00:00Z")
    await sessionsRepo.create(
      makeSession(userId, dev.props.id, {
        createdAt: new Date("2026-06-01T09:00:00Z"),
        lastSeenAt: new Date("2026-06-01T10:00:00Z"),
        ip: "1.1.1.1",
        ua: "Old",
      })
    )
    await sessionsRepo.create(
      makeSession(userId, dev.props.id, {
        createdAt: new Date("2026-06-01T09:30:00Z"),
        lastSeenAt: new Date("2026-06-01T11:59:00Z"),
        ip: "2.2.2.2",
        ua: "New",
      })
    )
    await sessionsRepo.create(
      makeSession(userId, dev.props.id, {
        createdAt: new Date("2026-04-01T00:00:00Z"),
        lastSeenAt: new Date("2026-05-01T00:00:00Z"),
        ip: "9.9.9.9",
        ua: "Stale",
      })
    )

    const idleTtl = 7 * 24 * 3600
    const absTtl = 30 * 24 * 3600
    const out = await devices.listActiveByUser(userId, now, idleTtl, absTtl)

    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe(dev.props.id)
    expect(out[0]?.activeSessionCount).toBe(2)
    expect(out[0]?.ipAddress).toBe("2.2.2.2")
    expect(out[0]?.userAgent).toBe("New")
    expect(out[0]?.lastSeenAt.toISOString()).toBe("2026-06-01T11:59:00.000Z")
  })

  it("deleteById faz cascade nas sessões e escopa por dono", async () => {
    const userId = await seedUser("owner-del@example.com")
    const other = await seedUser("other-del@example.com")
    const dev = Device.create({ userId, cookieTokenHash: "h" })
    await devices.create(dev)
    await sessionsRepo.create(makeSession(userId, dev.props.id, {}))

    expect(await devices.deleteById(dev.props.id, other)).toBe(0)
    expect(await devices.deleteById(dev.props.id, userId)).toBe(1)
    expect(await sessionsRepo.listByUser(userId)).toHaveLength(0)
  })
})

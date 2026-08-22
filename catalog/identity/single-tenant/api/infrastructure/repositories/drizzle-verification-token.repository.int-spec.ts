import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../domain/entities/user.entity"
import { VerificationToken } from "../../domain/entities/verification-token.entity"

import { DrizzleUserRepository } from "./drizzle-user.repository"
import { DrizzleVerificationTokenRepository } from "./drizzle-verification-token.repository"

import type { Pool } from "pg"

describe("DrizzleVerificationTokenRepository (int)", () => {
  let pool: Pool
  let tokens: DrizzleVerificationTokenRepository
  let usersRepo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    tokens = new DrizzleVerificationTokenRepository(txm)
    usersRepo = new DrizzleUserRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seedUserWithToken(hash: string): Promise<string> {
    const u = User.createActive({
      name: "T",
      email: `${ulid()}@example.com`,
      passwordHash: "$argon2id$x",
      pepperVersion: 1,
    })
    await usersRepo.insert(u)
    await tokens.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: u.props.id,
        tokenHash: hash,
        type: "password_reset",
        expiresAt: new Date(Date.now() + 3_600_000),
        consumedAt: null,
        createdAt: new Date(),
      })
    )
    return u.props.id
  }

  it("consumeByHash devolve userId e marca consumido", async () => {
    const hash = "hash-1"
    const userId = await seedUserWithToken(hash)
    const result = await tokens.consumeByHash(hash, "password_reset", new Date())
    expect(result).toEqual({ userId })
    const again = await tokens.consumeByHash(hash, "password_reset", new Date())
    expect(again).toBeNull()
  })

  it("consumo concorrente: exatamente 1 sucesso", async () => {
    const hash = "hash-concorrente"
    const userId = await seedUserWithToken(hash)
    const now = new Date()

    const [a, b] = await Promise.all([
      tokens.consumeByHash(hash, "password_reset", now),
      tokens.consumeByHash(hash, "password_reset", now),
    ])

    const successes = [a, b].filter((r) => r !== null)
    expect(successes).toHaveLength(1)
    expect(successes[0]).toEqual({ userId })
  })

  it("consumeByHash retorna null para token expirado", async () => {
    const u = User.createActive({
      name: "E",
      email: `${ulid()}@example.com`,
      passwordHash: "$argon2id$x",
      pepperVersion: 1,
    })
    await usersRepo.insert(u)
    await tokens.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: u.props.id,
        tokenHash: "expirado",
        type: "password_reset",
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
        createdAt: new Date(),
      })
    )
    expect(
      await tokens.consumeByHash("expirado", "password_reset", new Date())
    ).toBeNull()
  })

  it("invalidateAllForUser marca todos os pendentes do tipo", async () => {
    const hash = "pendente"
    const userId = await seedUserWithToken(hash)
    await tokens.invalidateAllForUser(userId, "password_reset")
    expect(
      await tokens.consumeByHash(hash, "password_reset", new Date())
    ).toBeNull()
  })

  it("findActiveByHash retorna token válido e null para expirado", async () => {
    const now = new Date("2026-06-08T00:00:00.000Z")
    const u = User.createActive({
      name: "B",
      email: `${ulid()}@example.com`,
      passwordHash: "$argon2id$x",
      pepperVersion: 1,
    })
    await usersRepo.insert(u)
    const uid = u.props.id

    await tokens.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: uid,
        tokenHash: "h-valid",
        type: "access_link",
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
        createdAt: new Date(),
      }),
    )
    const found = await tokens.findActiveByHash("h-valid", "access_link", now)
    expect(found?.userId).toBe(uid)

    await tokens.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: uid,
        tokenHash: "h-expired",
        type: "access_link",
        expiresAt: new Date(now.getTime() - 1000),
        consumedAt: null,
        createdAt: new Date(),
      }),
    )
    expect(await tokens.findActiveByHash("h-expired", "access_link", now)).toBeNull()
  })

  it("findLatestForUser retorna o token mais recente por createdAt", async () => {
    const now = new Date("2026-06-08T00:00:00.000Z")
    const u = User.createActive({
      name: "C",
      email: `${ulid()}@example.com`,
      passwordHash: "$argon2id$x",
      pepperVersion: 1,
    })
    await usersRepo.insert(u)
    const uid = u.props.id

    await tokens.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: uid,
        tokenHash: "h-old",
        type: "access_link",
        expiresAt: new Date(now.getTime() + 1000),
        consumedAt: null,
        createdAt: new Date("2026-06-08T00:00:00.000Z"),
      }),
    )
    await tokens.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: uid,
        tokenHash: "h-new",
        type: "access_link",
        expiresAt: new Date(now.getTime() + 2000),
        consumedAt: null,
        createdAt: new Date("2026-06-08T00:01:00.000Z"),
      }),
    )
    const latest = await tokens.findLatestForUser(uid, "access_link")
    expect(latest).not.toBeNull()
    expect(latest?.consumedAt).toBeNull()
  })
})

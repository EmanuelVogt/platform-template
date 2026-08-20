import {
  createTestDb,
  createTestPool,
} from "../../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../../test/setup/test-logger"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../../domain/entities/user.entity"
import { parseIdentityConfig } from "../../../identity.config"
import { IDENTITY_SESSION } from "../../identity-context"

import { ChangePasswordUseCase } from "./change-password.use-case"

import type { RequestContextStore } from "../../../../../shared/kernel/context/request-context"
import type { Pool } from "pg"

function makeUser(): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "argon2-real",
    pepperVersion: 1,
    status: "active",
    emailVerified: true,
    pendingEmail: null,
    accessProfile: "admin",
    servesClients: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: null,
    birthDate: null,
    avatarAttachmentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    createdByUserId: null,
  })
}

function authedStore(): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId: "c1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    actor: { id: "u-1", kind: "user" },
    extensions: new Map([
      [IDENTITY_SESSION, { sessionId: "sess-1", deviceId: null }],
    ]),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

describe("ChangePasswordUseCase — breach fora da tx (R17)", () => {
  let pool: Pool
  let txm: TransactionManager
  let ctx: RequestContext

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    txm.onModuleInit() // registra como manager ativo → @Transactional o usa
    ctx = new RequestContext()
  })

  afterAll(async () => {
    await pool.end()
  })

  it("o breach-check roda com isInTransaction() === false", async () => {
    let inTxDuringBreach: boolean | null = null
    const breach = {
      isBreached: () => {
        inTxDuringBreach = txm.isInTransaction()
        return Promise.resolve(false)
      },
    }
    const users = {
      findById: jest.fn().mockResolvedValue(makeUser()),
      findByIdForUpdate: jest.fn().mockResolvedValue(makeUser()),
      update: jest.fn().mockResolvedValue(undefined),
    }
    const sessions = { deleteOthers: jest.fn().mockResolvedValue(undefined) }
    const hasher = {
      verify: () => Promise.resolve(true),
      hash: () => Promise.resolve("argon2-new"),
    }
    const strength = { score: () => 4 }
    const authEvents = { recordInTx: jest.fn().mockResolvedValue(undefined) }
    const outbox = { publish: jest.fn().mockResolvedValue(undefined) }
    const clock = { now: () => new Date("2026-06-10T12:00:00.000Z") }

    const uc = new ChangePasswordUseCase(
      users as never,
      sessions as never,
      hasher as never,
      strength,
      breach,
      outbox as never,
      authEvents as never,
      clock,
      ctx,
      parseIdentityConfig({
        WEB_ORIGIN: "http://localhost:5173",
        PASSWORD_PEPPER: "x".repeat(32),
        CSRF_SECRET: "y".repeat(32),
        BREACH_CHECK_MODE: "fail_closed",
        COOKIE_SECURE: "false",
        COOKIE_NAME: "rit_session",
        DEVICE_COOKIE_NAME: "rit_device",
      }),
    )

    await ctx.run(authedStore(), () =>
      uc.execute({ currentPassword: "atual", newPassword: "nova-senha-forte-1" })
    )

    expect(inTxDuringBreach).toBe(false)
    // os writes (na tx do applyChange) ocorreram normalmente
    expect(users.update).toHaveBeenCalledTimes(1)
    expect(authEvents.recordInTx).toHaveBeenCalledTimes(1)
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        payload: expect.objectContaining({
          type: "password_changed",
          recipientId: "u-1",
          data: expect.objectContaining({
            email: "ana@example.com",
            at: "2026-06-10T12:00:00.000Z",
          }),
        }),
      }),
    )
  })
})

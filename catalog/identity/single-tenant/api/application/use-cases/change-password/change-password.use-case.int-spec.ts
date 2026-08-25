import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

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
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: null,
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
      check: () => {
        inTxDuringBreach = txm.isInTransaction()
        return Promise.resolve("clear" as const)
      },
    }
    const users = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      findByIdForUpdate: vi.fn().mockResolvedValue(makeUser()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    const sessions = { deleteOthers: vi.fn().mockResolvedValue(undefined) }
    const hasher = {
      verify: () => Promise.resolve(true),
      hash: () => Promise.resolve("argon2-new"),
    }
    const strength = { score: () => 4 }
    const authEvents = {
      record: vi.fn().mockResolvedValue(undefined),
      recordInTx: vi.fn().mockResolvedValue(undefined),
    }
    const outbox = { publish: vi.fn().mockResolvedValue(undefined) }
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
        BREACH_CHECK_ENABLED: "true",
        BREACH_CHECK_MODE: "fail_closed",
        COOKIE_SECURE: "false",
        COOKIE_NAME: "rit_session",
        DEVICE_COOKIE_NAME: "rit_device",
      })
    )

    await ctx.run(authedStore(), () =>
      uc.execute({
        currentPassword: "atual",
        newPassword: "nova-senha-forte-1",
      })
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
      })
    )
  })

  it("fail_open + consulta indisponível: a troca commita e o skip é auditado", async () => {
    const users = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      findByIdForUpdate: vi.fn().mockResolvedValue(makeUser()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    const sessions = { deleteOthers: vi.fn().mockResolvedValue(undefined) }
    const hasher = {
      verify: () => Promise.resolve(true),
      hash: () => Promise.resolve("argon2-new"),
    }
    const authEvents = {
      record: vi.fn().mockResolvedValue(undefined),
      recordInTx: vi.fn().mockResolvedValue(undefined),
    }
    let inTxDuringSkipRecord: boolean | null = null
    authEvents.record.mockImplementation(() => {
      inTxDuringSkipRecord = txm.isInTransaction()
      return Promise.resolve(undefined)
    })

    const uc = new ChangePasswordUseCase(
      users as never,
      sessions as never,
      hasher as never,
      { score: () => 4 },
      { check: () => Promise.resolve("skipped" as const) },
      { publish: vi.fn().mockResolvedValue(undefined) } as never,
      authEvents as never,
      { now: () => new Date("2026-06-10T12:00:00.000Z") },
      ctx,
      parseIdentityConfig({
        WEB_ORIGIN: "http://localhost:5173",
        PASSWORD_PEPPER: "x".repeat(32),
        CSRF_SECRET: "y".repeat(32),
        BREACH_CHECK_ENABLED: "true",
        BREACH_CHECK_MODE: "fail_open",
        COOKIE_SECURE: "false",
        COOKIE_NAME: "rit_session",
        DEVICE_COOKIE_NAME: "rit_device",
      })
    )

    await ctx.run(authedStore(), () =>
      uc.execute({
        currentPassword: "atual",
        newPassword: "nova-senha-forte-1",
      })
    )

    expect(users.update).toHaveBeenCalledTimes(1)
    // O skip é gravado FORA da tx (record, não recordInTx): a lacuna sobrevive
    // a um rollback posterior da troca.
    expect(inTxDuringSkipRecord).toBe(false)
    expect(authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          userId: "u-1",
          eventType: "breach_check_skipped",
          metadata: { mode: "fail_open" },
        }),
      })
    )
  })
})

import {
  createTestDb,
  createTestPool,
} from "../../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../../test/setup/test-logger"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../../domain/entities/user.entity"
import { parseIdentityConfig } from "../../../identity.config"

import { ResetPasswordUseCase } from "./reset-password.use-case"

import type { RequestContextStore } from "../../../../../shared/kernel/context/request-context"
import type { BreachVerdict } from "../../../domain/ports/breach-check"
import type { Pool } from "pg"

const NOW = new Date("2026-06-10T12:00:00.000Z")

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

function anonymousStore(): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId: "c1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

function configWith(mode: "fail_open" | "fail_closed") {
  return parseIdentityConfig({
    WEB_ORIGIN: "http://localhost:5173",
    PASSWORD_PEPPER: "x".repeat(32),
    CSRF_SECRET: "y".repeat(32),
    BREACH_CHECK_ENABLED: "true",
    BREACH_CHECK_MODE: mode,
    COOKIE_SECURE: "false",
    COOKIE_NAME: "rit_session",
    DEVICE_COOKIE_NAME: "rit_device",
  })
}

describe("ResetPasswordUseCase — breach fora da tx (R17)", () => {
  let pool: Pool
  let txm: TransactionManager
  let ctx: RequestContext

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    txm.onModuleInit()
    ctx = new RequestContext()
  })

  afterAll(async () => {
    await pool.end()
  })

  function makeUseCase(
    check: () => Promise<BreachVerdict>,
    mode: "fail_open" | "fail_closed",
  ) {
    const verificationTokens = {
      consumeByHash: jest
        .fn()
        .mockResolvedValue({ userId: "u-1", type: "password_reset" }),
      invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
    }
    const users = {
      findById: jest.fn().mockResolvedValue(makeUser()),
      update: jest.fn().mockResolvedValue(undefined),
    }
    const sessions = { deleteAllForUser: jest.fn().mockResolvedValue(undefined) }
    const authEvents = {
      record: jest.fn().mockResolvedValue(undefined),
      recordInTx: jest.fn().mockResolvedValue(undefined),
    }
    const uc = new ResetPasswordUseCase(
      verificationTokens as never,
      users as never,
      sessions as never,
      { hash: () => Promise.resolve("argon2-new") } as never,
      { score: () => 4 },
      { check },
      { hashOf: () => "hash-of-raw" } as never,
      { publish: jest.fn().mockResolvedValue(undefined) } as never,
      authEvents as never,
      { now: () => NOW },
      ctx,
      configWith(mode),
    )
    return { uc, users, verificationTokens, authEvents }
  }

  it("a consulta HIBP roda com isInTransaction() === false", async () => {
    let inTxDuringBreach: boolean | null = null
    const t = makeUseCase(() => {
      inTxDuringBreach = txm.isInTransaction()
      return Promise.resolve("clear")
    }, "fail_closed")

    await ctx.run(anonymousStore(), () =>
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    )

    expect(inTxDuringBreach).toBe(false)
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("fail_open + consulta indisponível: o reset commita e o skip é auditado na tx", async () => {
    const t = makeUseCase(() => Promise.resolve("skipped"), "fail_open")

    await ctx.run(anonymousStore(), () =>
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    )

    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          userId: "u-1",
          eventType: "breach_check_skipped",
          metadata: { mode: "fail_open" },
        }),
      }),
    )
  })

  it("fail_closed + consulta indisponível: nada é consumido nem gravado", async () => {
    const t = makeUseCase(
      () => Promise.reject(new Error("HIBP fora")),
      "fail_closed",
    )

    await expect(
      ctx.run(anonymousStore(), () =>
        t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
      ),
    ).rejects.toThrow()

    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })
})

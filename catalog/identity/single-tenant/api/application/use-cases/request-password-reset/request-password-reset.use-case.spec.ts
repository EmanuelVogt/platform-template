import { describe, expect, it, vi } from "vitest"

import { User, type UserProps } from "../../../domain/entities/user.entity"
import { makeIdentityConfig } from "../../../testing/identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { RequestPasswordResetUseCase } from "./request-password-reset.use-case"

const NOW = new Date("2026-05-30T00:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Carol",
    email: "carol@example.com",
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
    ...over,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? {
    findByEmail: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const verificationTokens = over.verificationTokens ?? {
    invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  }
  const tokens = over.tokens ?? {
    generate: vi.fn().mockReturnValue({ raw: "raw-tok", hash: "hash-tok" }),
  }
  const outbox = over.outbox ?? {
    publish: vi.fn().mockResolvedValue(undefined),
  }
  const authEvents = over.authEvents ?? {
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx =
    over.ctx ??
    fakeRequestContext(() => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
    }))
  const config =
    over.config ?? makeIdentityConfig({ RESET_COOLDOWN_SECONDS: 3600 })
  const uc = new RequestPasswordResetUseCase(
    users,
    verificationTokens,
    tokens,
    outbox,
    authEvents,
    clock,
    ctx,
    config
  )
  return {
    uc,
    users,
    verificationTokens,
    tokens,
    outbox,
    authEvents,
    clock,
    ctx,
  }
}

describe("RequestPasswordResetUseCase", () => {
  it("e-mail inexistente: gera token dummy e NÃO publica nem audita (anti-enum)", async () => {
    const t = makeDeps({
      users: { findByEmail: vi.fn().mockResolvedValue(null), update: vi.fn() },
    })
    await t.uc.execute({ email: "ghost@example.com" })
    expect(t.tokens.generate).toHaveBeenCalledTimes(1)
    expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("cooldown ativo: não invalida, não publica, não audita", async () => {
    const t = makeDeps({
      users: {
        findByEmail: vi
          .fn()
          .mockResolvedValue(makeUser({ lastResetRequestedAt: NOW })),
        update: vi.fn(),
      },
    })
    await t.uc.execute({ email: "carol@example.com" })
    expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("cooldown expirado: lastResetRequestedAt antigo o suficiente → fluxo completo", async () => {
    // cooldown = 3600s; lastResetRequestedAt 3601s antes de NOW → condição falsa → segue happy path
    const expiredAt = new Date(NOW.getTime() - 3601 * 1000)
    const t = makeDeps({
      users: {
        findByEmail: vi
          .fn()
          .mockResolvedValue(makeUser({ lastResetRequestedAt: expiredAt })),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })
    await t.uc.execute({ email: "carol@example.com" })
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith(
      "u-1",
      "password_reset"
    )
    expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalledTimes(1)
    expect(t.authEvents.recordInTx).toHaveBeenCalledTimes(1)
  })

  it("happy: invalida pendentes, cria token, publica SendPasswordReset e audita", async () => {
    const t = makeDeps()
    await t.uc.execute({ email: "Carol@Example.com" })
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith(
      "u-1",
      "password_reset"
    )
    expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        aggregateId: "u-1",
        payload: expect.objectContaining({
          type: "password_reset_requested",
          data: expect.objectContaining({
            email: "carol@example.com",
            link: expect.stringContaining("/redefinir-senha?token=raw-tok"),
          }),
        }),
      })
    )
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          eventType: "password_reset_requested",
        }),
      })
    )
  })
})

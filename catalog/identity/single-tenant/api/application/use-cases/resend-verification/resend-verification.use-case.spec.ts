import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { ResendVerificationUseCase } from "./resend-verification.use-case"


const NOW = new Date("2026-05-30T00:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Carol",
    email: "carol@example.com",
    passwordHash: "argon2-real",
    pepperVersion: 1,
    status: "active",
    emailVerified: false,
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
    ...over,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? {
    findById: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const verificationTokens = over.verificationTokens ?? {
    invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  }
  const tokens = over.tokens ?? {
    generate: vi.fn().mockReturnValue({ raw: "raw-tok", hash: "hash-tok" }),
  }
  const outbox = over.outbox ?? { publish: vi.fn().mockResolvedValue(undefined) }
  const clock = over.clock ?? { now: () => NOW }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-1",
      sessionId: "s-1",
    }))
  const config =
    over.config ?? makeIdentityConfig({ VERIFICATION_COOLDOWN_SECONDS: 3600 })
  const uc = new ResendVerificationUseCase(
    users,
    verificationTokens,
    tokens,
    outbox,
    clock,
    ctx,
    config,
  )
  return { uc, users, verificationTokens, tokens, outbox, clock, ctx }
}


describe("ResendVerificationUseCase", () => {
  it("sem auth lança ForbiddenError", async () => {
    const t = makeDeps({
      ctx: fakeRequestContext(() => ({ correlationId: "c1", locale: "pt-BR", userId: null, sessionId: null })),
    })
    await expect(t.uc.execute({})).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("usuário não encontrado: no-op (nada criado nem publicado)", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    })
    await t.uc.execute({})
    expect(t.verificationTokens.create).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("e-mail já verificado: no-op (nada criado nem publicado)", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ emailVerified: true })),
        update: vi.fn(),
      },
    })
    await t.uc.execute({})
    expect(t.verificationTokens.create).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("cooldown expirado: envia novo token mesmo com lastVerificationRequestedAt definido", async () => {
    // Última requisição foi 2h atrás; cooldown é 3600s (1h) → expirado → deve prosseguir.
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 3600 * 1000)
    const t = makeDeps({
      users: {
        findById: vi
          .fn()
          .mockResolvedValue(makeUser({ lastVerificationRequestedAt: twoHoursAgo })),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })
    await t.uc.execute({})
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith(
      "u-1",
      "email_verify",
    )
    expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalledTimes(1)
  })

  it("cooldown ativo: no-op", async () => {
    const t = makeDeps({
      users: {
        findById: vi
          .fn()
          .mockResolvedValue(makeUser({ lastVerificationRequestedAt: NOW })),
        update: vi.fn(),
      },
    })
    await t.uc.execute({})
    expect(t.verificationTokens.create).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("happy: invalida pendentes, cria token e publica SendEmailVerification", async () => {
    const t = makeDeps()
    await t.uc.execute({})
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith(
      "u-1",
      "email_verify",
    )
    expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        aggregateId: "u-1",
        payload: expect.objectContaining({
          type: "email_verification",
          locale: "pt-BR",
          data: expect.objectContaining({
            email: "carol@example.com",
            link: expect.stringContaining("/verificar-email?token=raw-tok"),
          }),
        }),
      }),
    )
  })
})

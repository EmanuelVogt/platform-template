import { User } from "../../../domain/entities/user.entity"
import { InvalidResetTokenError, WeakPasswordError } from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"

import { ResetPasswordUseCase } from "./reset-password.use-case"


 
function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    consumeByHash: jest.fn().mockResolvedValue({ userId: "u-1" }),
    invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
  }
  const users = over.users ?? {
    findById: jest.fn().mockResolvedValue(
      User.fromProps({
        id: "u-1",
        name: "Carol",
        email: "carol@example.com",
        passwordHash: "argon2-real",
        pepperVersion: 1,
        status: "active",
        emailVerified: true,
        pendingEmail: null,
        accessProfile: "admin",
        attendsGuests: false,
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
      }),
    ),
    update: jest.fn().mockResolvedValue(undefined),
  }
  const sessions = over.sessions ?? {
    deleteAllForUser: jest.fn().mockResolvedValue(undefined),
  }
  const hasher = over.hasher ?? { hash: jest.fn().mockResolvedValue("argon2-new") }
  const strength = over.strength ?? { score: jest.fn().mockReturnValue(4) }
  const breach = over.breach ?? { isBreached: jest.fn().mockResolvedValue(false) }
  const tokens = over.tokens ?? {
    hashOf: jest.fn().mockReturnValue("hash-of-raw"),
  }
  const outbox = over.outbox ?? { publish: jest.fn().mockResolvedValue(undefined) }
  const authEvents = over.authEvents ?? {
    recordInTx: jest.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => new Date("2026-05-30T00:00:00.000Z") }
  const ctx = over.ctx ?? {
    get: () => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
    }),
  }
  const config = over.config ?? makeIdentityConfig()
  const uc = new ResetPasswordUseCase(
    verificationTokens,
    users,
    sessions,
    hasher,
    strength,
    breach,
    tokens,
    outbox,
    authEvents,
    clock,
    ctx,
    config,
  )
  return { uc, verificationTokens, users, sessions, hasher, strength, breach, tokens, outbox, authEvents, clock, ctx }
}
 

describe("ResetPasswordUseCase", () => {
  it("token inválido (consume retorna null) lança InvalidResetTokenError", async () => {
    const t = makeDeps({
      verificationTokens: {
        consumeByHash: jest.fn().mockResolvedValue(null),
        invalidateAllForUser: jest.fn(),
      },
    })
    await expect(
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError)
    expect(t.sessions.deleteAllForUser).not.toHaveBeenCalled()
  })

  it("token válido: troca senha, invalida TODAS as sessões e tokens pendentes", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.sessions.deleteAllForUser).toHaveBeenCalledWith("u-1")
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith(
      "u-1",
      "password_reset",
    )
  })

  it("consome o token pelo HASH do raw (nunca o raw)", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "raw-tok", password: "nova-senha-forte-1" })
    expect(t.tokens.hashOf).toHaveBeenCalledWith("raw-tok")
    expect(t.verificationTokens.consumeByHash).toHaveBeenCalledWith(
      "hash-of-raw",
      "password_reset",
      expect.any(Date),
    )
  })

  it("publica notification.requested password_changed", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        payload: expect.objectContaining({
          type: "password_changed",
          recipientId: "u-1",
          data: expect.objectContaining({
            email: expect.any(String),
            at: expect.any(String),
          }),
        }),
      }),
    )
  })

  it("senha fraca lança e NÃO troca a senha", async () => {
    const t = makeDeps({ strength: { score: jest.fn().mockReturnValue(0) } })
    await expect(
      t.uc.execute({ token: "tok", password: "123" }),
    ).rejects.toThrow()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("senha vazada (fail_closed) lança WeakPasswordError ANTES de tocar o banco", async () => {
    const t = makeDeps({
      breach: { isBreached: jest.fn().mockResolvedValue(true) },
      config: makeIdentityConfig({ BREACH_CHECK_MODE: "fail_closed" }),
    })
    await expect(
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    ).rejects.toBeInstanceOf(WeakPasswordError)
    // breach é pré-condição: o token não chega a ser consumido nem a senha trocada.
    expect(t.breach.isBreached).toHaveBeenCalled()
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("modo fail_open: breach NÃO é consultado mesmo que senha esteja vazada", async () => {
    const isBreached = jest.fn().mockResolvedValue(true)
    const t = makeDeps({
      breach: { isBreached },
      config: makeIdentityConfig({ BREACH_CHECK_MODE: "fail_open" }),
    })
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(isBreached).not.toHaveBeenCalled()
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("usuário não encontrado após consumir token lança InvalidResetTokenError", async () => {
    const t = makeDeps({
      users: {
        findById: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    })
    await expect(
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.sessions.deleteAllForUser).not.toHaveBeenCalled()
    expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
  })

  it("registra auth event password_reset_completed após troca bem-sucedida", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          userId: "u-1",
          eventType: "password_reset_completed",
        }),
      }),
    )
  })

  it("notificação inclui locale correto do contexto de requisição", async () => {
    const t = makeDeps({
      ctx: {
        get: () => ({
          ip: null,
          userAgent: null,
          correlationId: "c2",
          locale: "en-US",
          userId: null,
          sessionId: null,
        }),
      },
    })
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ locale: "en-US" }),
      }),
    )
  })
})

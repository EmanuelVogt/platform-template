import { describe, expect, it, vi } from "vitest"

import { User } from "../../../domain/entities/user.entity"
import {
  BreachCheckUnavailableError,
  InvalidResetTokenError,
  WeakPasswordError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { ResetPasswordUseCase } from "./reset-password.use-case"


 
function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    consumeByHash: vi.fn().mockResolvedValue({ userId: "u-1" }),
    invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
  }
  const users = over.users ?? {
    findById: vi.fn().mockResolvedValue(
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
      }),
    ),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const sessions = over.sessions ?? {
    deleteAllForUser: vi.fn().mockResolvedValue(undefined),
  }
  const hasher = over.hasher ?? { hash: vi.fn().mockResolvedValue("argon2-new") }
  const strength = over.strength ?? { score: vi.fn().mockReturnValue(4) }
  const breach = over.breach ?? { check: vi.fn().mockResolvedValue("clear") }
  const tokens = over.tokens ?? {
    hashOf: vi.fn().mockReturnValue("hash-of-raw"),
  }
  const outbox = over.outbox ?? { publish: vi.fn().mockResolvedValue(undefined) }
  const authEvents = over.authEvents ?? {
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => new Date("2026-05-30T00:00:00.000Z") }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
    }))
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
        consumeByHash: vi.fn().mockResolvedValue(null),
        invalidateAllForUser: vi.fn(),
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
    const t = makeDeps({ strength: { score: vi.fn().mockReturnValue(0) } })
    await expect(
      t.uc.execute({ token: "tok", password: "123" }),
    ).rejects.toThrow()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("senha vazada lança WeakPasswordError ANTES de tocar o banco", async () => {
    const t = makeDeps({
      breach: { check: vi.fn().mockResolvedValue("breached") },
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_closed",
      }),
    })
    await expect(
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    ).rejects.toBeInstanceOf(WeakPasswordError)
    // breach é pré-condição: o token não chega a ser consumido nem a senha trocada.
    expect(t.breach.check).toHaveBeenCalled()
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("desabilitado: breach NÃO é consultado", async () => {
    const check = vi.fn().mockResolvedValue("breached")
    const t = makeDeps({
      breach: { check },
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: false,
        BREACH_CHECK_MODE: "fail_closed",
      }),
    })
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(check).not.toHaveBeenCalled()
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("habilitado em fail_open: senha vazada é barrada (o modo não decide SE consulta)", async () => {
    const check = vi.fn().mockResolvedValue("breached")
    const t = makeDeps({
      breach: { check },
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_open",
      }),
    })
    await expect(
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    ).rejects.toBeInstanceOf(WeakPasswordError)
    expect(check).toHaveBeenCalledWith("nova-senha-forte-1")
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("fail_open + consulta indisponível: reset segue e grava breach_check_skipped", async () => {
    const t = makeDeps({
      breach: { check: vi.fn().mockResolvedValue("skipped") },
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_open",
      }),
    })
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
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

  it("fail_closed + consulta indisponível: 503 sobe e o token não é consumido", async () => {
    const t = makeDeps({
      breach: {
        check: vi.fn().mockRejectedValue(new BreachCheckUnavailableError()),
      },
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_closed",
      }),
    })
    await expect(
      t.uc.execute({ token: "tok", password: "nova-senha-forte-1" }),
    ).rejects.toBeInstanceOf(BreachCheckUnavailableError)
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("usuário não encontrado após consumir token lança InvalidResetTokenError", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
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
      ctx: fakeRequestContext(() => ({
          ip: null,
          userAgent: null,
          correlationId: "c2",
          locale: "en-US",
          userId: null,
          sessionId: null,
        })),
    })
    await t.uc.execute({ token: "tok", password: "nova-senha-forte-1" })
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ locale: "en-US" }),
      }),
    )
  })
})

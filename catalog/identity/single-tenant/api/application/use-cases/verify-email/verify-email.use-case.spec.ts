import { type Mock, describe, expect, it, vi } from "vitest"

import { User, type UserProps } from "../../../domain/entities/user.entity"
import { InvalidResetTokenError } from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { VerifyEmailUseCase } from "./verify-email.use-case"


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
  const verificationTokens = over.verificationTokens ?? {
    consumeByHash: vi.fn().mockResolvedValue({ userId: "u-1" }),
  }
  const users = over.users ?? {
    findById: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const tokens = over.tokens ?? {
    hashOf: vi.fn().mockReturnValue("hash-of-raw"),
  }
  const authEvents = over.authEvents ?? {
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
    }))
  const uc = new VerifyEmailUseCase(
    verificationTokens,
    users,
    tokens,
    authEvents,
    clock,
    ctx,
  )
  return { uc, verificationTokens, users, tokens, authEvents, clock, ctx }
}


describe("VerifyEmailUseCase", () => {
  it("token inválido (consume retorna null) lança e NÃO atualiza o usuário", async () => {
    const t = makeDeps({
      verificationTokens: { consumeByHash: vi.fn().mockResolvedValue(null) },
    })
    await expect(t.uc.execute({ token: "tok" })).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    )
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("usuário removido (findById null) lança InvalidResetTokenError", async () => {
    const t = makeDeps({
      users: { findById: vi.fn().mockResolvedValue(null), update: vi.fn() },
    })
    await expect(t.uc.execute({ token: "tok" })).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    )
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("happy: consome pelo HASH (nunca o raw), verifica e-mail e audita", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "raw-tok" })
    expect(t.tokens.hashOf).toHaveBeenCalledWith("raw-tok")
    expect(t.verificationTokens.consumeByHash).toHaveBeenCalledWith(
      "hash-of-raw",
      "email_verify",
      expect.any(Date),
    )
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "email_verified" }),
      }),
    )
  })

  it("usuário removido (findById null) NÃO chama authEvents", async () => {
    const authEvents = { recordInTx: vi.fn() }
    const t = makeDeps({
      users: { findById: vi.fn().mockResolvedValue(null), update: vi.fn() },
      authEvents,
    })
    await expect(t.uc.execute({ token: "tok" })).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    )
    expect(authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("happy: update é chamado com usuário com emailVerified=true", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "raw-tok" })
    const [updatedUser] = (t.users.update as Mock).mock.calls[0] as [User]
    expect(updatedUser.props.emailVerified).toBe(true)
  })

  it("recordInTx lançando propaga o erro sem silenciar", async () => {
    const recordError = new Error("falha ao gravar evento")
    const t = makeDeps({
      authEvents: { recordInTx: vi.fn().mockRejectedValue(recordError) },
    })
    await expect(t.uc.execute({ token: "tok" })).rejects.toBe(recordError)
  })
})

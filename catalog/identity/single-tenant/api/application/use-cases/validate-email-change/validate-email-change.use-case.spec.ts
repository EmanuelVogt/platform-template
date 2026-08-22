import { type Mock, describe, expect, it, vi } from "vitest"

import { User, type UserProps } from "../../../domain/entities/user.entity"
import { InvalidEmailChangeTokenError } from "../../../domain/errors"

import { ValidateEmailChangeQuery } from "./validate-email-change.use-case"

const NOW = new Date("2026-06-16T10:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Beatriz",
    email: "beatriz@example.com",
    passwordHash: "argon2-hash",
    pepperVersion: 1,
    status: "active",
    emailVerified: true,
    pendingEmail: "nova@example.com",
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

function makeDeps(over: Record<string, unknown> = {}) {
  const verificationTokens = (over.verificationTokens as Record<string, Mock> | undefined) ?? {
    findActiveByHash: vi.fn().mockResolvedValue({ userId: "u-1", expiresAt: new Date("2026-06-17T00:00:00.000Z") }),
  }
  const users = (over.users as Record<string, Mock> | undefined) ?? {
    findById: vi.fn().mockResolvedValue(makeUser()),
  }
  const tokens = (over.tokens as Record<string, Mock> | undefined) ?? {
    hashOf: vi.fn().mockReturnValue("token-hash"),
  }
  const clock = (over.clock as { now: () => Date } | undefined) ?? { now: () => NOW }

  const uc = new ValidateEmailChangeQuery(
    verificationTokens as never,
    users as never,
    tokens as never,
    clock,
  )
  return { uc, verificationTokens, users, tokens, clock }
}

describe("ValidateEmailChangeQuery", () => {
  it("caminho feliz: token ativo e pendingEmail definido retornam newEmail", async () => {
    const t = makeDeps()
    const out = await t.uc.execute({ token: "raw-token" })
    expect(out.newEmail).toBe("nova@example.com")
    expect(t.tokens.hashOf).toHaveBeenCalledWith("raw-token")
    expect(t.verificationTokens.findActiveByHash).toHaveBeenCalledWith(
      "token-hash",
      "email_change",
      NOW,
    )
    expect(t.users.findById).toHaveBeenCalledWith("u-1")
  })

  it("token inativo (findActiveByHash null) lança InvalidEmailChangeTokenError", async () => {
    const t = makeDeps({
      verificationTokens: {
        findActiveByHash: vi.fn().mockResolvedValue(null),
      },
    })
    await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
      InvalidEmailChangeTokenError,
    )
    expect(t.users.findById).not.toHaveBeenCalled()
  })

  it("usuário não encontrado (findById null) lança InvalidEmailChangeTokenError", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(null),
      },
    })
    await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
      InvalidEmailChangeTokenError,
    )
  })

  it("usuário sem pendingEmail lança InvalidEmailChangeTokenError", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ pendingEmail: null })),
      },
    })
    await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
      InvalidEmailChangeTokenError,
    )
  })

  it("usa o clock.now() como referência de validade passada ao repositório", async () => {
    const customNow = new Date("2026-06-16T15:30:00.000Z")
    const t = makeDeps({ clock: { now: () => customNow } })
    await t.uc.execute({ token: "tok" })
    expect(t.verificationTokens.findActiveByHash).toHaveBeenCalledWith(
      expect.any(String),
      "email_change",
      customNow,
    )
  })

  it("em falha de token, users.findById NÃO é chamado", async () => {
    const t = makeDeps({
      verificationTokens: {
        findActiveByHash: vi.fn().mockResolvedValue(null),
      },
      users: { findById: vi.fn() },
    })
    await expect(t.uc.execute({ token: "tok" })).rejects.toBeInstanceOf(
      InvalidEmailChangeTokenError,
    )
    expect(t.users.findById).not.toHaveBeenCalled()
  })

  it("userId do token ativo é repassado exatamente ao repositório de usuários", async () => {
    const t = makeDeps({
      verificationTokens: {
        findActiveByHash: vi.fn().mockResolvedValue({
          userId: "u-específico-99",
          expiresAt: new Date("2026-06-17T00:00:00.000Z"),
        }),
      },
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ pendingEmail: "x@y.com" })),
      },
    })
    await t.uc.execute({ token: "raw" })
    expect(t.users.findById).toHaveBeenCalledWith("u-específico-99")
  })

  it("quando pendingEmail é null a query lança mas NÃO propaga dado parcial", async () => {
    const findById = vi.fn().mockResolvedValue(makeUser({ pendingEmail: null }))
    const t = makeDeps({ users: { findById } })
    const result = t.uc.execute({ token: "tok" })
    await expect(result).rejects.toBeInstanceOf(InvalidEmailChangeTokenError)
    expect(findById).toHaveBeenCalledTimes(1)
  })
})

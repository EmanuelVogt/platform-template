import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import { UserNotFoundError } from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { DeleteUserUseCase } from "./delete-user.use-case"

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-target",
    name: "Alvo",
    email: "alvo@example.com",
    passwordHash: "argon2",
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
    ...over,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? {
    findById: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const sessions = over.sessions ?? {
    deleteAllForUser: vi.fn().mockResolvedValue(undefined),
  }
  const authEvents = over.authEvents ?? {
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => new Date("2026-06-10T12:00:00.000Z") }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-admin",
      ip: "1.2.3.4",
      userAgent: "jest",
    }))
  const uc = new DeleteUserUseCase(users, sessions, authEvents, clock, ctx)
  return { uc, users, sessions, authEvents, clock, ctx }
}

describe("DeleteUserUseCase", () => {
  it("soft-deleta, revoga as sessões e audita user_deleted", async () => {
    const { uc, users, sessions, authEvents } = makeDeps()
    await uc.execute({ userId: "u-target" })

    expect(users.update).toHaveBeenCalledTimes(1)
    const updated = users.update.mock.calls[0]?.[0] as User
    expect(updated.isDeleted()).toBe(true)
    expect(sessions.deleteAllForUser).toHaveBeenCalledWith("u-target")
    expect(authEvents.recordInTx.mock.calls[0]?.[0].props.eventType).toBe(
      "user_deleted",
    )
  })

  it("404 quando o usuário não existe", async () => {
    const { uc, users } = makeDeps({
      users: { findById: vi.fn().mockResolvedValue(null), update: vi.fn() },
    })
    await expect(uc.execute({ userId: "x" })).rejects.toThrow(UserNotFoundError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("404 quando já está soft-deleted (idempotente)", async () => {
    const { uc } = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ deletedAt: new Date() })),
        update: vi.fn(),
      },
    })
    await expect(uc.execute({ userId: "u-target" })).rejects.toThrow(UserNotFoundError)
  })

  it("recusa excluir o usuário master", async () => {
    const { uc, users } = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ accessProfile: "master" })),
        update: vi.fn(),
      },
    })
    await expect(uc.execute({ userId: "u-target" })).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("recusa excluir a própria conta (actor == alvo)", async () => {
    const { uc, users } = makeDeps({
      ctx: fakeRequestContext(() => ({
          correlationId: "c1",
          locale: "pt-BR",
          userId: "u-target",
          ip: null,
          userAgent: null,
        })),
    })
    await expect(uc.execute({ userId: "u-target" })).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import { SessionNotFoundError } from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { GetCurrentUserUseCase } from "./get-current-user.use-case"

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Carol",
    email: "carol@example.com",
    passwordHash: "argon2-secreto",
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
    findByIdWithPermissions: vi.fn().mockResolvedValue({
      user: makeUser(),
      permissions: ["admin.users.read"],
    }),
  }
  const ctx =
    over.ctx ??
    fakeRequestContext(() => ({
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-1",
      sessionId: "s-1",
    }))
  const uc = new GetCurrentUserUseCase(users, ctx)
  return { uc, users }
}

describe("GetCurrentUserUseCase", () => {
  it("sem auth lança ForbiddenError", async () => {
    const t = makeDeps({
      ctx: fakeRequestContext(() => ({
        correlationId: "c1",
        locale: "pt-BR",
        userId: null,
        sessionId: null,
      })),
    })
    await expect(t.uc.execute({})).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("usuário removido lança SessionNotFoundError", async () => {
    const t = makeDeps({
      users: { findByIdWithPermissions: vi.fn().mockResolvedValue(null) },
    })
    await expect(t.uc.execute({})).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it("usuário soft-deleted lança SessionNotFoundError (hard gate preservado)", async () => {
    const t = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser({ deletedAt: new Date("2026-06-01T00:00:00Z") }),
          permissions: [],
        }),
      },
    })
    await expect(t.uc.execute({})).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it("happy: retorna a view pública com permissões, sem vazar passwordHash", async () => {
    const t = makeDeps()
    const out = await t.uc.execute({})
    expect(out.user).toMatchObject({
      id: "u-1",
      name: "Carol",
      email: "carol@example.com",
      emailVerified: true,
      accessProfile: "admin",
      permissions: ["admin.users.read"],
    })
    expect(out.user).not.toHaveProperty("passwordHash")
  })
})

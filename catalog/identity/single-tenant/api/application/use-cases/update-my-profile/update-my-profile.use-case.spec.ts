import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import { fakeRequestContext } from "../../request-context.fixture"

import { UpdateMyProfileUseCase } from "./update-my-profile.use-case"

const NOW = new Date("2026-06-16T00:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "argon2-hash",
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
    findById: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx =
    over.ctx ??
    fakeRequestContext(() => ({
      userId: "u-1",
      sessionId: "s-1",
      ip: "1.2.3.4",
      userAgent: "jest",
      correlationId: "c1",
      locale: "pt-BR",
    }))
  const uc = new UpdateMyProfileUseCase(users, clock, ctx)
  return { uc, users, clock, ctx }
}

describe("UpdateMyProfileUseCase", () => {
  it("caminho feliz: atualiza nome e chama users.update com a nova entidade", async () => {
    const t = makeDeps()
    await t.uc.execute({ name: "Ana Silva" })
    expect(t.users.update).toHaveBeenCalledTimes(1)
    const updated = t.users.update.mock.calls[0]?.[0] as User
    expect(updated.props.name).toBe("Ana Silva")
    expect(updated.props.updatedAt).toEqual(NOW)
  })
  it("ctx sem userId lança ForbiddenError e NÃO chama users.findById nem users.update", async () => {
    const t = makeDeps({
      ctx: fakeRequestContext(() => ({
        userId: null,
        sessionId: null,
        ip: null,
        userAgent: null,
        correlationId: "c1",
        locale: "pt-BR",
      })),
    })
    await expect(t.uc.execute({ name: "Ana" })).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect(t.users.findById).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("ctx sem sessionId lança ForbiddenError e NÃO chama users.findById nem users.update", async () => {
    const t = makeDeps({
      ctx: fakeRequestContext(() => ({
        userId: "u-1",
        sessionId: null,
        ip: null,
        userAgent: null,
        correlationId: "c1",
        locale: "pt-BR",
      })),
    })
    await expect(t.uc.execute({ name: "Ana" })).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect(t.users.findById).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("usuário não encontrado no repositório lança ForbiddenError e NÃO chama users.update", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    })
    await expect(t.uc.execute({ name: "Ana" })).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect(t.users.update).not.toHaveBeenCalled()
  })
  it("findById é chamado com o userId do contexto autenticado", async () => {
    const t = makeDeps()
    await t.uc.execute({ name: "Ana" })
    expect(t.users.findById).toHaveBeenCalledWith("u-1")
  })

  it("nome é trimado antes de persistir", async () => {
    const t = makeDeps()
    await t.uc.execute({ name: "  Ana Lima  " })
    const updated = t.users.update.mock.calls[0]?.[0] as User
    expect(updated.props.name).toBe("Ana Lima")
  })

  it("clock.now() é chamado exatamente uma vez por execução", async () => {
    const now = vi.fn().mockReturnValue(NOW)
    const t = makeDeps({ clock: { now } })
    await t.uc.execute({ name: "Ana" })
    expect(now).toHaveBeenCalledTimes(1)
  })

  it("ctx.get() lança → erro propaga antes de findById ou update serem chamados", async () => {
    const ctxErr = new Error(
      "RequestContext acessado fora de um escopo de request"
    )
    const t = makeDeps({
      ctx: fakeRequestContext(() => {
        throw ctxErr
      }),
    })
    await expect(t.uc.execute({ name: "Ana" })).rejects.toThrow(ctxErr)
    expect(t.users.findById).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("usuário soft-deleted encontrado por findById: atualiza normalmente (sem guard de deletedAt no use-case)", async () => {
    const deletedUser = makeUser({
      deletedAt: new Date("2026-03-01T00:00:00.000Z"),
    })
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(deletedUser),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })
    await t.uc.execute({ name: "Ana Arquivada" })
    expect(t.users.update).toHaveBeenCalledTimes(1)
    const updated = t.users.update.mock.calls[0]?.[0] as User
    expect(updated.props.name).toBe("Ana Arquivada")
  })
})

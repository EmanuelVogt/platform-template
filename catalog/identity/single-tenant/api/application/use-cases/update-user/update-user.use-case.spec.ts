import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import {
  InvalidPermissionSetError,
  PermissionGrantNotAllowedError,
  UserNotFoundError,
} from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { UpdateUserUseCase } from "./update-user.use-case"

const BASE_INPUT = {
  userId: "u-target",
  name: "Novo Nome",
  accessProfile: "admin" as const,
  permissions: ["admin.users.read" as const],
  areaIds: [] as string[],
  serviceIds: [] as string[],
  schedulingAreaIds: [] as string[],
}

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
    findByIdWithPermissions: vi.fn().mockResolvedValue({
      user: makeUser(),
      permissions: [],
    }),
    findProfessionalScope: vi
      .fn()
      .mockResolvedValue({ areaIds: [], serviceIds: [] }),
    update: vi.fn().mockResolvedValue(undefined),
    replacePermissions: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? {
    now: () => new Date("2026-06-12T12:00:00.000Z"),
  }
  const ctx =
    over.ctx ??
    fakeRequestContext(() => ({
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-admin",
      ip: null,
      userAgent: null,
      access: { permissions: new Set<string>(), isMaster: true },
    }))
  const scope = over.scope ?? {
    assertValid: vi.fn().mockResolvedValue(undefined),
  }
  const uc = new UpdateUserUseCase(users, clock, ctx, scope)
  return { uc, users, scope }
}

describe("UpdateUserUseCase", () => {
  it("atualiza nome, perfil e set do alvo", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser({ accessProfile: "professional" }),
          permissions: [],
        }),
        update: vi.fn().mockResolvedValue(undefined),
        replacePermissions: vi.fn().mockResolvedValue(undefined),
      },
    })
    await uc.execute({
      ...BASE_INPUT,
      permissions: ["admin.users.read", "admin.users.create"],
    })

    expect(users.update).toHaveBeenCalledTimes(1)
    const updated = users.update.mock.calls[0][0] as User
    expect(updated.props.name).toBe("Novo Nome")
    expect(updated.props.accessProfile).toBe("admin")
    expect(users.replacePermissions).toHaveBeenCalledWith("u-target", [
      "admin.users.read",
      "admin.users.create",
    ])
  })

  it("revogar do alvo chave que o ator não possui → 403, nada é gravado", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser(),
          permissions: ["admin.users.read", "admin.tags.read"],
        }),
        update: vi.fn(),
        replacePermissions: vi.fn(),
      },
      ctx: fakeRequestContext(() => ({
        correlationId: "c1",
        locale: "pt-BR",
        userId: "u-admin",
        access: {
          permissions: new Set(["admin.users.read", "admin.users.update"]),
          isMaster: false,
        },
      })),
    })

    await expect(
      uc.execute({ ...BASE_INPUT, permissions: ["admin.users.read"] })
    ).rejects.toThrow(PermissionGrantNotAllowedError)
    expect(users.update).not.toHaveBeenCalled()
    expect(users.replacePermissions).not.toHaveBeenCalled()
  })

  it("revogar do alvo chave que o ator possui → grava o novo conjunto", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser(),
          permissions: ["admin.users.read", "admin.tags.read"],
        }),
        update: vi.fn().mockResolvedValue(undefined),
        replacePermissions: vi.fn().mockResolvedValue(undefined),
      },
      ctx: fakeRequestContext(() => ({
        correlationId: "c1",
        locale: "pt-BR",
        userId: "u-admin",
        access: {
          permissions: new Set(["admin.users.read", "admin.tags.read"]),
          isMaster: false,
        },
      })),
    })

    await uc.execute({ ...BASE_INPUT, permissions: ["admin.users.read"] })

    expect(users.replacePermissions).toHaveBeenCalledWith("u-target", [
      "admin.users.read",
    ])
  })

  it("alvo inexistente → UserNotFoundError", async () => {
    const { uc } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        replacePermissions: vi.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(UserNotFoundError)
  })

  it("alvo na lixeira → UserNotFoundError", async () => {
    const { uc } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser({ deletedAt: new Date() }),
          permissions: [],
        }),
        update: vi.fn(),
        replacePermissions: vi.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(UserNotFoundError)
  })

  it("alvo master → ForbiddenError", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser({ accessProfile: "master" }),
          permissions: [],
        }),
        update: vi.fn(),
        replacePermissions: vi.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("auto-edição de perfil → ForbiddenError", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser({ accessProfile: "professional" }),
          permissions: ["admin.users.read"],
        }),
        update: vi.fn(),
        replacePermissions: vi.fn(),
      },
      ctx: fakeRequestContext(() => ({
        correlationId: "c1",
        locale: "pt-BR",
        userId: "u-target",
      })),
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("auto-edição de permissões → ForbiddenError", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser(),
          permissions: ["admin.users.read"],
        }),
        update: vi.fn(),
        replacePermissions: vi.fn(),
      },
      ctx: fakeRequestContext(() => ({
        correlationId: "c1",
        locale: "pt-BR",
        userId: "u-target",
      })),
    })
    await expect(
      uc.execute({
        ...BASE_INPUT,
        permissions: ["admin.users.read", "admin.users.create"],
      })
    ).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("auto-edição só de nome → permitida", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser(),
          permissions: ["admin.users.read"],
        }),
        findProfessionalScope: vi
          .fn()
          .mockResolvedValue({ areaIds: [], serviceIds: [] }),
        update: vi.fn().mockResolvedValue(undefined),
        replacePermissions: vi.fn().mockResolvedValue(undefined),
      },
      ctx: fakeRequestContext(() => ({
        correlationId: "c1",
        locale: "pt-BR",
        userId: "u-target",
        access: { permissions: new Set<string>(), isMaster: true },
      })),
    })
    await uc.execute(BASE_INPUT)
    expect(users.update).toHaveBeenCalledTimes(1)
  })
  it("set sem closure → InvalidPermissionSetError", async () => {
    const { uc } = makeDeps()
    await expect(
      uc.execute({ ...BASE_INPUT, permissions: ["admin.users.create"] })
    ).rejects.toThrow(InvalidPermissionSetError)
  })

  it("set sem piso → InvalidPermissionSetError", async () => {
    const { uc } = makeDeps()
    await expect(
      uc.execute({ ...BASE_INPUT, permissions: [] })
    ).rejects.toThrow(InvalidPermissionSetError)
  })

  describe("auto-edição não amplia o próprio escopo", () => {
    function selfDeps(
      over: {
        user?: Partial<UserProps>
        scope?: { areaIds: string[]; serviceIds: string[] }
      } = {}
    ) {
      const users = {
        findByIdWithPermissions: vi.fn().mockResolvedValue({
          user: makeUser(over.user),
          permissions: ["admin.users.read"],
        }),
        findProfessionalScope: vi
          .fn()
          .mockResolvedValue(over.scope ?? { areaIds: [], serviceIds: [] }),
        update: vi.fn().mockResolvedValue(undefined),
        replacePermissions: vi.fn().mockResolvedValue(undefined),
      }
      return makeDeps({
        users,
        ctx: fakeRequestContext(() => ({
          correlationId: "c1",
          locale: "pt-BR",
          userId: "u-target",
          access: {
            permissions: new Set(["admin.users.read"]),
            isMaster: false,
          },
        })),
      })
    }
    it("mudar as próprias áreas de atuação → 403", async () => {
      const { uc, users } = selfDeps({
        scope: { areaIds: ["a-1"], serviceIds: [] },
      })

      await expect(
        uc.execute({
          ...BASE_INPUT,
          areaIds: ["a-1", "a-2"],
        })
      ).rejects.toThrow(ForbiddenError)
      expect(users.update).not.toHaveBeenCalled()
    })

    it("mudar os próprios serviços de atuação → 403", async () => {
      const { uc, users } = selfDeps({
        scope: { areaIds: ["a-1"], serviceIds: ["s-1"] },
      })

      await expect(
        uc.execute({
          ...BASE_INPUT,
          areaIds: ["a-1"],
          serviceIds: ["s-1", "s-2"],
        })
      ).rejects.toThrow(ForbiddenError)
      expect(users.update).not.toHaveBeenCalled()
    })

    it("carregar área de agendamento na auto-edição → 403", async () => {
      const { uc, users } = selfDeps()

      await expect(
        uc.execute({ ...BASE_INPUT, schedulingAreaIds: ["area-1"] })
      ).rejects.toThrow(ForbiddenError)
      expect(users.update).not.toHaveBeenCalled()
    })

    it("reenviar o mesmo escopo (no-op) passa", async () => {
      const { uc, users } = selfDeps({
        scope: { areaIds: ["a-1"], serviceIds: ["s-1"] },
      })

      await uc.execute({
        ...BASE_INPUT,
        areaIds: ["a-1"],
        serviceIds: ["s-1"],
      })

      expect(users.update).toHaveBeenCalledTimes(1)
    })

    it("a regra é só da auto-edição: master muda o escopo de outro usuário", async () => {
      const { uc, users } = makeDeps({
        users: {
          findByIdWithPermissions: vi.fn().mockResolvedValue({
            user: makeUser(),
            permissions: [],
          }),
          findProfessionalScope: vi
            .fn()
            .mockResolvedValue({ areaIds: [], serviceIds: [] }),
          update: vi.fn().mockResolvedValue(undefined),
          replacePermissions: vi.fn().mockResolvedValue(undefined),
        },
      })

      await uc.execute({
        ...BASE_INPUT,
        areaIds: ["a-1"],
        schedulingAreaIds: ["area-1"],
      })

      expect(users.update).toHaveBeenCalledTimes(1)
    })
  })
})

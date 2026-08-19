import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import {
  InvalidPermissionSetError,
  ProfessionalHasCommitmentsError,
  UserNotFoundError,
} from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { UpdateUserUseCase } from "./update-user.use-case"

const BASE_INPUT = {
  userId: "u-target",
  name: "Novo Nome",
  accessProfile: "admin" as const,
  servesClients: false,
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
    findByIdWithPermissions: jest.fn().mockResolvedValue({
      user: makeUser(),
      permissions: [],
    }),
    update: jest.fn().mockResolvedValue(undefined),
    replacePermissions: jest.fn().mockResolvedValue(undefined),
    replaceProfessionalAreas: jest.fn().mockResolvedValue(undefined),
    replaceProfessionalServices: jest.fn().mockResolvedValue(undefined),
    replaceSchedulingAreas: jest.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => new Date("2026-06-12T12:00:00.000Z") }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-admin",
      ip: null,
      userAgent: null,
      access: { permissions: new Set<string>(), isMaster: true },
    }))
  const scope = over.scope ?? {
    assertValid: jest.fn().mockResolvedValue(undefined),
  }
  const commitments = over.commitments ?? {
    listFuture: jest.fn().mockResolvedValue([]),
  }
  const uc = new UpdateUserUseCase(users, clock, ctx, scope, commitments)
  return { uc, users, scope, commitments }
}

describe("UpdateUserUseCase", () => {
  it("atualiza nome, perfil e set do alvo", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser({ accessProfile: "professional" }),
          permissions: [],
        }),
        update: jest.fn().mockResolvedValue(undefined),
        replacePermissions: jest.fn().mockResolvedValue(undefined),
        replaceProfessionalAreas: jest.fn().mockResolvedValue(undefined),
        replaceProfessionalServices: jest.fn().mockResolvedValue(undefined),
        replaceSchedulingAreas: jest.fn().mockResolvedValue(undefined),
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

  it("alvo inexistente → UserNotFoundError", async () => {
    const { uc } = makeDeps({
      users: {
        findByIdWithPermissions: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        replacePermissions: jest.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(UserNotFoundError)
  })

  it("alvo na lixeira → UserNotFoundError", async () => {
    const { uc } = makeDeps({
      users: {
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser({ deletedAt: new Date() }),
          permissions: [],
        }),
        update: jest.fn(),
        replacePermissions: jest.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(UserNotFoundError)
  })

  it("alvo master → ForbiddenError", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser({ accessProfile: "master" }),
          permissions: [],
        }),
        update: jest.fn(),
        replacePermissions: jest.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("auto-edição de perfil → ForbiddenError", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser({ accessProfile: "professional" }),
          permissions: ["admin.users.read"],
        }),
        update: jest.fn(),
        replacePermissions: jest.fn(),
      },
      ctx: fakeRequestContext(() => ({ correlationId: "c1", locale: "pt-BR", userId: "u-target" })),
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(ForbiddenError)
    expect(users.update).not.toHaveBeenCalled()
  })

  it("auto-edição de permissões → ForbiddenError", async () => {
    const { uc, users } = makeDeps({
      users: {
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser(),
          permissions: ["admin.users.read"],
        }),
        update: jest.fn(),
        replacePermissions: jest.fn(),
      },
      ctx: fakeRequestContext(() => ({ correlationId: "c1", locale: "pt-BR", userId: "u-target" })),
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
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser(),
          permissions: ["admin.users.read"],
        }),
        update: jest.fn().mockResolvedValue(undefined),
        replacePermissions: jest.fn().mockResolvedValue(undefined),
        replaceProfessionalAreas: jest.fn().mockResolvedValue(undefined),
        replaceProfessionalServices: jest.fn().mockResolvedValue(undefined),
        replaceSchedulingAreas: jest.fn().mockResolvedValue(undefined),
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

  it("áreas de agendamento informadas substituem as do alvo", async () => {
    const { uc, users } = makeDeps()
    await uc.execute({
      ...BASE_INPUT,
      accessProfile: "admin",
      permissions: ["admin.tags.read"],
      schedulingAreaIds: ["area-1", "area-2"],
    })
    expect(users.replaceSchedulingAreas).toHaveBeenCalledWith("u-target", [
      "area-1",
      "area-2",
    ])
  })

  it("sem áreas de agendamento no input as do alvo são limpas", async () => {
    const { uc, users } = makeDeps()
    await uc.execute(BASE_INPUT)
    expect(users.replaceSchedulingAreas).toHaveBeenCalledWith("u-target", [])
  })

  describe("tirar do atendimento a cliente", () => {
    function attendingUser() {
      return {
        findByIdWithPermissions: jest.fn().mockResolvedValue({
          user: makeUser({ servesClients: true }),
          permissions: [],
        }),
        update: jest.fn().mockResolvedValue(undefined),
        replacePermissions: jest.fn().mockResolvedValue(undefined),
        replaceProfessionalAreas: jest.fn().mockResolvedValue(undefined),
        replaceProfessionalServices: jest.fn().mockResolvedValue(undefined),
        replaceSchedulingAreas: jest.fn().mockResolvedValue(undefined),
      }
    }

    const COMMITMENT = {
      kind: "service" as const,
      id: "appt-1",
      name: "Massagem",
      date: "2026-08-12",
      startMinute: 600,
      endMinute: 650,
    }

    it("com compromisso futuro recusa e não grava nada", async () => {
      const users = attendingUser()
      const { uc } = makeDeps({
        users,
        commitments: { listFuture: jest.fn().mockResolvedValue([COMMITMENT]) },
      })
      await expect(
        uc.execute({ ...BASE_INPUT, servesClients: false })
      ).rejects.toThrow(ProfessionalHasCommitmentsError)
      expect(users.update).not.toHaveBeenCalled()
      expect(users.replaceProfessionalAreas).not.toHaveBeenCalled()
    })

    it("a recusa carrega a lista do que precisa ser remarcado", async () => {
      const { uc } = makeDeps({
        users: attendingUser(),
        commitments: { listFuture: jest.fn().mockResolvedValue([COMMITMENT]) },
      })
      try {
        await uc.execute({ ...BASE_INPUT, servesClients: false })
        throw new Error("deveria ter recusado")
      } catch (error) {
        expect(error).toBeInstanceOf(ProfessionalHasCommitmentsError)
        expect(
          (error as ProfessionalHasCommitmentsError).extensions
        ).toEqual({ commitments: [COMMITMENT] })
      }
    })

    it("sem compromisso futuro grava e zera o escopo de atuação", async () => {
      const users = attendingUser()
      const { uc } = makeDeps({ users })
      await uc.execute({
        ...BASE_INPUT,
        servesClients: false,
        areaIds: ["area-1"],
      })
      expect(users.update).toHaveBeenCalledTimes(1)
      expect(
        (users.update.mock.calls[0][0] as User).props.servesClients
      ).toBe(false)
      expect(users.replaceProfessionalAreas).toHaveBeenCalledWith("u-target", [])
    })

    it("quem já não atendia não consulta a agenda", async () => {
      const { uc, commitments } = makeDeps()
      await uc.execute({ ...BASE_INPUT, servesClients: false })
      expect(commitments.listFuture).not.toHaveBeenCalled()
    })

    it("continuar atendendo não consulta a agenda", async () => {
      const { uc, commitments } = makeDeps({
        users: attendingUser(),
        scope: { assertValid: jest.fn().mockResolvedValue(undefined) },
      })
      await uc.execute({
        ...BASE_INPUT,
        servesClients: true,
        areaIds: ["area-1"],
      })
      expect(commitments.listFuture).not.toHaveBeenCalled()
    })
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
})

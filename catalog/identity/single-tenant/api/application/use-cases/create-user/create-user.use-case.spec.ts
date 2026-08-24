import { describe, expect, it, vi } from "vitest"

import {
  EmailAlreadyInUseError,
  InvalidPermissionSetError,
  InvalidProfessionalScopeError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { CreateUserUseCase } from "./create-user.use-case"

const NOW = new Date("2026-06-08T00:00:00.000Z")

const BASE_ACCESS = {
  accessProfile: "admin" as const,
  servesClients: false,
  permissions: ["admin.users.read" as const],
  areaIds: [] as string[],
  serviceIds: [] as string[],
  schedulingAreaIds: [] as string[],
}

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? {
    findByEmail: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
    replacePermissions: vi.fn().mockResolvedValue(undefined),
    replaceProfessionalAreas: vi.fn().mockResolvedValue(undefined),
    replaceProfessionalServices: vi.fn().mockResolvedValue(undefined),
    replaceSchedulingAreas: vi.fn().mockResolvedValue(undefined),
  }
  const scope = over.scope ?? {
    assertValid: vi.fn().mockResolvedValue(undefined),
  }
  const verificationTokens = over.verificationTokens ?? {
    create: vi.fn().mockResolvedValue(undefined),
  }
  const tokens = over.tokens ?? {
    generate: vi.fn().mockReturnValue({ raw: "raw-tok", hash: "hash-tok" }),
  }
  const outbox = over.outbox ?? {
    publish: vi.fn().mockResolvedValue(undefined),
  }
  const authEvents = over.authEvents ?? {
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx =
    over.ctx ??
    fakeRequestContext(() => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: "master-1",
      sessionId: null,
      traceId: null,
      spanId: null,
      access: { permissions: new Set<string>(), isMaster: true },
    }))
  const config = over.config ?? makeIdentityConfig()
  const uc = new CreateUserUseCase(
    users,
    verificationTokens,
    tokens,
    outbox,
    authEvents,
    clock,
    ctx,
    config,
    scope
  )
  return { uc, users, verificationTokens, tokens, outbox, authEvents, scope }
}

describe("CreateUserUseCase", () => {
  it("e-mail já existente lança EmailAlreadyInUseError e não cria nada", async () => {
    const t = makeDeps({
      users: {
        findByEmail: vi
          .fn()
          .mockResolvedValue({ isDeleted: () => false, props: { id: "u-x" } }),
        insert: vi.fn(),
      },
    })
    await expect(
      t.uc.execute({ name: "Ana", email: "ana@x.test", ...BASE_ACCESS })
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError)
    expect(t.users.insert).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("e-mail de usuário soft-deleted → EmailAlreadyInUseError (409 único)", async () => {
    const t = makeDeps({
      users: {
        findByEmail: vi
          .fn()
          .mockResolvedValue({ isDeleted: () => true, props: { id: "u-x" } }),
        insert: vi.fn(),
      },
    })
    await expect(
      t.uc.execute({ name: "Novo", email: "morta@example.com", ...BASE_ACCESS })
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError)
    expect(t.users.insert).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("happy: cria pending, gera token, publica SendAccessLink e audita access_link_sent", async () => {
    const t = makeDeps()
    await t.uc.execute({ name: "Ana", email: "Ana@X.test", ...BASE_ACCESS })
    expect(t.users.insert).toHaveBeenCalledTimes(1)
    expect(t.users.replacePermissions).toHaveBeenCalledWith(
      expect.any(String),
      ["admin.users.read"]
    )
    expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        payload: expect.objectContaining({
          type: "access_link_sent",
          data: expect.objectContaining({
            email: "ana@x.test",
            name: "Ana",
            link: expect.stringContaining("/configurar-senha?token=raw-tok"),
          }),
        }),
      })
    )
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "access_link_sent" }),
      })
    )
  })

  it("rejeita set sem closure (422)", async () => {
    const t = makeDeps()
    await expect(
      t.uc.execute({
        name: "Ana",
        email: "ana@x.test",
        accessProfile: "admin",
        servesClients: false,
        permissions: ["admin.users.create"],
        areaIds: [],
        serviceIds: [],
        schedulingAreaIds: [],
      })
    ).rejects.toBeInstanceOf(InvalidPermissionSetError)
    expect(t.users.insert).not.toHaveBeenCalled()
  })

  it("rejeita set sem o piso do perfil (422)", async () => {
    const t = makeDeps()
    await expect(
      t.uc.execute({
        name: "Ana",
        email: "ana@x.test",
        accessProfile: "admin",
        servesClients: false,
        permissions: [],
        areaIds: [],
        serviceIds: [],
        schedulingAreaIds: [],
      })
    ).rejects.toBeInstanceOf(InvalidPermissionSetError)
    expect(t.users.insert).not.toHaveBeenCalled()
  })

  it("quem atende sem área → InvalidProfessionalScopeError, não cria nada", async () => {
    const t = makeDeps()
    await expect(
      t.uc.execute({
        name: "Pro",
        email: "pro@x.test",
        accessProfile: "professional",
        servesClients: true,
        permissions: [],
        areaIds: [],
        serviceIds: [],
        schedulingAreaIds: [],
      })
    ).rejects.toBeInstanceOf(InvalidProfessionalScopeError)
    expect(t.users.insert).not.toHaveBeenCalled()
  })

  it("quem atende persiste permissões de outros módulos + áreas", async () => {
    const t = makeDeps()
    t.scope.assertValid.mockResolvedValue(undefined)
    await t.uc.execute({
      name: "Pro Cross",
      email: "pro.cross@example.com",
      accessProfile: "professional",
      servesClients: true,
      permissions: ["admin.users.read"],
      areaIds: ["area-1"],
      serviceIds: [],
      schedulingAreaIds: [],
    })
    expect(t.users.replacePermissions).toHaveBeenCalledWith(
      expect.any(String),
      ["admin.users.read"]
    )
    expect(t.users.replaceProfessionalAreas).toHaveBeenCalledWith(
      expect.any(String),
      ["area-1"]
    )
  })

  it("quem não atende persiste só as áreas de agendamento", async () => {
    const t = makeDeps()
    await t.uc.execute({
      name: "Ag",
      email: "ag@x.test",
      accessProfile: "admin",
      servesClients: false,
      permissions: ["admin.tags.read"],
      areaIds: ["area-ignorada"],
      serviceIds: [],
      schedulingAreaIds: ["area-1", "area-2"],
    })
    expect(t.users.replaceSchedulingAreas).toHaveBeenCalledWith(
      expect.any(String),
      ["area-1", "area-2"]
    )
    expect(t.users.replaceProfessionalAreas).toHaveBeenCalledWith(
      expect.any(String),
      []
    )
  })

  it("quem atende sem permissão de módulo é válido (piso = ≥1 área de atuação)", async () => {
    const t = makeDeps()
    t.scope.assertValid.mockResolvedValue(undefined)
    await t.uc.execute({
      name: "Pro Vazio",
      email: "pro.vazio@example.com",
      accessProfile: "professional",
      servesClients: true,
      permissions: [],
      areaIds: ["area-1"],
      serviceIds: [],
      schedulingAreaIds: [],
    })
    expect(t.users.replacePermissions).toHaveBeenCalledWith(
      expect.any(String),
      []
    )
  })
})

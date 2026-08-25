import { describe, expect, it, vi } from "vitest"

import {
  EmailAlreadyInUseError,
  InvalidPermissionSetError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../testing/identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { CreateUserUseCase } from "./create-user.use-case"

const NOW = new Date("2026-06-08T00:00:00.000Z")

const BASE_ACCESS = {
  accessProfile: "admin" as const,
  permissions: ["admin.users.read" as const],
}

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? {
    findByEmail: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
    replacePermissions: vi.fn().mockResolvedValue(undefined),
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
    config
  )
  return { uc, users, verificationTokens, tokens, outbox, authEvents }
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
        permissions: ["admin.users.create"],
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
        permissions: [],
      })
    ).rejects.toBeInstanceOf(InvalidPermissionSetError)
    expect(t.users.insert).not.toHaveBeenCalled()
  })
  it("persiste permissões de outros módulos em qualquer perfil", async () => {
    const t = makeDeps()
    await t.uc.execute({
      name: "Pro Cross",
      email: "pro.cross@example.com",
      accessProfile: "admin",
      permissions: ["admin.users.read"],
    })
    expect(t.users.replacePermissions).toHaveBeenCalledWith(
      expect.any(String),
      ["admin.users.read"]
    )
  })
})

import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import {
  BreachCheckUnavailableError,
  InvalidCredentialsError,
  WeakPasswordError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { ChangePasswordUseCase } from "./change-password.use-case"

const NOW = new Date("2026-06-16T00:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "argon2-current",
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
    findByIdForUpdate: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const sessions = over.sessions ?? {
    deleteOthers: vi.fn().mockResolvedValue(undefined),
  }
  const hasher = over.hasher ?? {
    verify: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("argon2-new"),
  }
  const strength = over.strength ?? {
    score: vi.fn().mockReturnValue(4),
  }
  const breach = over.breach ?? {
    check: vi.fn().mockResolvedValue("clear"),
  }
  const outbox = over.outbox ?? {
    publish: vi.fn().mockResolvedValue(undefined),
  }
  const authEvents = over.authEvents ?? {
    record: vi.fn().mockResolvedValue(undefined),
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      ip: "1.2.3.4",
      userAgent: "jest",
      correlationId: "c1",
      locale: "pt-BR",
      traceId: null,
      spanId: null,
      userId: "u-1",
      sessionId: "sess-1",
    }))
  const config = over.config ?? makeIdentityConfig()

  const uc = new ChangePasswordUseCase(
    users,
    sessions,
    hasher,
    strength,
    breach,
    outbox,
    authEvents,
    clock,
    ctx,
    config,
  )
  return { uc, users, sessions, hasher, strength, breach, outbox, authEvents }
}

const VALID_INPUT = {
  currentPassword: "senha-atual",
  newPassword: "nova-senha-forte-1234",
}

describe("ChangePasswordUseCase", () => {
  it("caminho feliz: atualiza senha, revoga outras sessões, audita e publica notificação", async () => {
    const t = makeDeps()
    await t.uc.execute(VALID_INPUT)

    expect(t.users.update).toHaveBeenCalledTimes(1)

    expect(t.sessions.deleteOthers).toHaveBeenCalledWith("u-1", "sess-1")

    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "password_changed" }),
      }),
    )

    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        payload: expect.objectContaining({
          type: "password_changed",
          recipientId: "u-1",
          data: expect.objectContaining({
            email: "ana@example.com",
            at: NOW.toISOString(),
          }),
        }),
      }),
    )
  })

  it("contexto sem userId lança ForbiddenError antes de qualquer IO", async () => {
    const t = makeDeps({
      ctx: fakeRequestContext(() => ({
          ip: "1.2.3.4",
          userAgent: "jest",
          correlationId: "c1",
          locale: "pt-BR",
          traceId: null,
          spanId: null,
          userId: null,
          sessionId: null,
        })),
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.users.findById).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("usuário não encontrado no repo lança ForbiddenError (não expõe existência)", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.sessions.deleteOthers).not.toHaveBeenCalled()
  })

  it("usuário sem senha (pending) lança InvalidCredentialsError", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
        update: vi.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.sessions.deleteOthers).not.toHaveBeenCalled()
  })

  it("senha atual incorreta lança InvalidCredentialsError sem atualizar nada", async () => {
    const t = makeDeps({
      hasher: {
        verify: vi.fn().mockResolvedValue(false),
        hash: vi.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.sessions.deleteOthers).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("nova senha com score fraco lança WeakPasswordError sem atualizar nada", async () => {
    const config = makeIdentityConfig({ PASSWORD_MIN_ZXCVBN_SCORE: 3 })
    const t = makeDeps({
      config,
      strength: { score: vi.fn().mockReturnValue(1) },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(WeakPasswordError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.sessions.deleteOthers).not.toHaveBeenCalled()
  })

  it("nova senha em breach lança WeakPasswordError sem atualizar nada", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: true,
      BREACH_CHECK_MODE: "fail_closed",
    })
    const t = makeDeps({
      config,
      breach: { check: vi.fn().mockResolvedValue("breached") },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(WeakPasswordError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.sessions.deleteOthers).not.toHaveBeenCalled()
  })

  it("breach check NÃO é chamado quando BREACH_CHECK_ENABLED é false", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: false,
      BREACH_CHECK_MODE: "fail_closed",
    })
    const t = makeDeps({ config })
    await t.uc.execute(VALID_INPUT)
    expect(t.breach.check).not.toHaveBeenCalled()
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("habilitado em fail_open: a senha vazada é barrada (o modo não decide SE consulta)", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: true,
      BREACH_CHECK_MODE: "fail_open",
    })
    const t = makeDeps({
      config,
      breach: { check: vi.fn().mockResolvedValue("breached") },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(WeakPasswordError)
    expect(t.breach.check).toHaveBeenCalledWith(VALID_INPUT.newPassword)
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("fail_open + consulta indisponível: troca segue e grava breach_check_skipped", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: true,
      BREACH_CHECK_MODE: "fail_open",
    })
    const t = makeDeps({
      config,
      breach: { check: vi.fn().mockResolvedValue("skipped") },
    })
    await t.uc.execute(VALID_INPUT)
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          userId: "u-1",
          eventType: "breach_check_skipped",
          metadata: { mode: "fail_open" },
        }),
      }),
    )
  })

  it("fail_closed + consulta indisponível: 503 sobe e nada é persistido", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: true,
      BREACH_CHECK_MODE: "fail_closed",
    })
    const t = makeDeps({
      config,
      breach: {
        check: vi.fn().mockRejectedValue(new BreachCheckUnavailableError()),
      },
    })
    const error = await t.uc
      .execute(VALID_INPUT)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BreachCheckUnavailableError)
    expect(error).toMatchObject({ status: 503 })
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.authEvents.record).not.toHaveBeenCalled()
  })

  it("consulta bem-sucedida NÃO grava breach_check_skipped", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: true,
      BREACH_CHECK_MODE: "fail_open",
    })
    const t = makeDeps({ config })
    await t.uc.execute(VALID_INPUT)
    expect(t.authEvents.record).not.toHaveBeenCalled()
  })

  it("hash da nova senha é chamado antes de persistir", async () => {
    const t = makeDeps()
    await t.uc.execute(VALID_INPUT)
    expect(t.hasher.hash).toHaveBeenCalledWith(VALID_INPUT.newPassword)
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("fail_closed: senha não-breachada prossegue normalmente e persiste a troca", async () => {
    const config = makeIdentityConfig({
      BREACH_CHECK_ENABLED: true,
      BREACH_CHECK_MODE: "fail_closed",
    })
    const breach = { check: vi.fn().mockResolvedValue("clear") }
    const t = makeDeps({ config, breach })
    await t.uc.execute(VALID_INPUT)
    expect(breach.check).toHaveBeenCalledWith(VALID_INPUT.newPassword)
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.sessions.deleteOthers).toHaveBeenCalledWith("u-1", "sess-1")
    expect(t.authEvents.recordInTx).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalledTimes(1)
  })

  it("usuário não encontrado: sessions.deleteOthers e outbox.publish NÃO são chamados", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.sessions.deleteOthers).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("passwordHash nulo: hasher.verify e users.update NÃO são chamados", async () => {
    const t = makeDeps({
      users: {
        findById: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
        update: vi.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.hasher.verify).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("senha atual inválida: breach.check e users.update NÃO são chamados", async () => {
    const t = makeDeps({
      hasher: {
        verify: vi.fn().mockResolvedValue(false),
        hash: vi.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.breach.check).not.toHaveBeenCalled()
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })
})

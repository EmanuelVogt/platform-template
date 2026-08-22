import { User } from "../../../domain/entities/user.entity"
import {
  BreachCheckUnavailableError,
  InvalidAccessLinkError,
  ProfileImageStoreMissingError,
  WeakPasswordError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"
import { CreateSessionService } from "../../services/create-session.service"

import { SetPasswordUseCase } from "./set-password.use-case"

const VALID_INPUT = {
  token: "raw",
  password: "Senha-Muito-Forte-2026!",
  name: "Ana Oliveira",
  birthDate: "1990-05-15",
}

function pendingUser(createdByUserId: string | null = null) {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@x.test",
    emailVerified: false,
    pendingEmail: null,
    accessProfile: "admin",
    servesClients: false,
    passwordHash: null,
    pepperVersion: 1,
    status: "pending",
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
    createdByUserId,
  })
}

function makeSessionService() {
  const sessions = {
    create: jest.fn().mockResolvedValue(undefined),
    countByUser: jest.fn().mockResolvedValue(1),
    deleteOldestOverCap: jest.fn().mockResolvedValue(undefined),
  }
  const devices = {
    findByUserAndCookieHash: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(undefined),
  }
  const tokens = {
    generate: jest.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
    hashOf: jest.fn().mockReturnValue("hash-of-raw"),
  }
  const config = makeIdentityConfig()
  const ctx = fakeRequestContext(() => ({
      ip: "1.2.3.4",
      userAgent: "jest",
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
      traceId: null,
      spanId: null,
    }))
  return new CreateSessionService(sessions as never, devices as never, tokens as never, config, ctx)
}

function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    findActiveByHash: jest.fn().mockResolvedValue({ userId: "u-1", expiresAt: new Date("2099-01-01") }),
    consumeByHash: jest.fn().mockResolvedValue({ userId: "u-1" }),
    invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
  }
  const users = over.users ?? {
    findById: jest.fn().mockResolvedValue(pendingUser()),
    update: jest.fn().mockResolvedValue(undefined),
    findPermissions: jest.fn().mockResolvedValue([]),
  }
  const hasher = over.hasher ?? { hash: jest.fn().mockResolvedValue("argon2-novo") }
  const strength = over.strength ?? { score: jest.fn().mockReturnValue(4) }
  const breach = over.breach ?? { check: jest.fn().mockResolvedValue("clear") }
  const tokens = over.tokens ?? { hashOf: jest.fn().mockReturnValue("hash-of-raw") }
  const outbox = over.outbox ?? { publish: jest.fn().mockResolvedValue(undefined) }
  const authEvents = over.authEvents ?? { recordInTx: jest.fn().mockResolvedValue(undefined) }
  const clock = over.clock ?? { now: () => new Date("2026-06-08T00:00:00.000Z") }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      ip: null,
      userAgent: null,
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
      traceId: null,
      spanId: null,
    }))
  const config = over.config ?? makeIdentityConfig()
  const attachments =
    "attachments" in over
      ? over.attachments
      : { exists: jest.fn().mockResolvedValue(false) }
  const createSession = over.createSession ?? makeSessionService()
  const uc = new SetPasswordUseCase(
    verificationTokens,
    users,
    hasher,
    strength,
    breach,
    tokens,
    outbox,
    authEvents,
    clock,
    ctx,
    config,
    attachments,
    createSession,
  )
  return { uc, verificationTokens, users, hasher, outbox, authEvents, attachments }
}

describe("SetPasswordUseCase", () => {
  it("sem provider da porta e com avatar submetido: lança ProfileImageStoreMissingError sem consumir o token", async () => {
    const t = makeDeps({ attachments: null })
    await expect(
      t.uc.execute({ ...VALID_INPUT, avatarAttachmentId: "att-x" }),
    ).rejects.toMatchObject({
      status: 501,
      type: "https://errors.example.com/identity/profile-image-store-missing",
      name: ProfileImageStoreMissingError.name,
    })
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("sem provider da porta e sem avatar submetido: a senha é definida normalmente", async () => {
    const t = makeDeps({ attachments: null })
    await t.uc.execute(VALID_INPUT)
    expect(t.verificationTokens.consumeByHash).toHaveBeenCalledTimes(1)
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("token inválido (findActive null) lança InvalidAccessLinkError sem consumir", async () => {
    const t = makeDeps({
      verificationTokens: {
        findActiveByHash: jest.fn().mockResolvedValue(null),
        consumeByHash: jest.fn(),
        invalidateAllForUser: jest.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("consume null na tx lança InvalidAccessLinkError", async () => {
    const t = makeDeps({
      verificationTokens: {
        findActiveByHash: jest.fn().mockResolvedValue({ userId: "u-1", expiresAt: new Date("2099-01-01") }),
        consumeByHash: jest.fn().mockResolvedValue(null),
        invalidateAllForUser: jest.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("happy: ativa conta, cria sessão, invalida tokens e audita password_set", async () => {
    const t = makeDeps()
    const out = await t.uc.execute(VALID_INPUT)
    expect(t.verificationTokens.consumeByHash).toHaveBeenCalledWith("hash-of-raw", "access_link", expect.any(Date))
    expect(t.users.update).toHaveBeenCalledTimes(1)
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith("u-1", "access_link")
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ eventType: "password_set" }) }),
    )
    expect(out.sessionToken).toBe("raw-sess")
    expect(typeof out.sessionId).toBe("string")
    expect(typeof out.deviceCookie).toBe("string")
    expect(out.user.id).toBe("u-1")
  })

  it("token válido mas usuário não-pending lança InvalidAccessLinkError (não ativa)", async () => {
    const active = User.createActive({
      name: "Bia",
      email: "bia@x.test",
      passwordHash: "argon2",
      pepperVersion: 1,
    })
    const t = makeDeps({
      users: { findById: jest.fn().mockResolvedValue(active), update: jest.fn() },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("user criado por admin: publica password_set com recipient = admin", async () => {
    const t = makeDeps({
      users: {
        findById: jest.fn().mockResolvedValue(pendingUser("admin-1")),
        update: jest.fn().mockResolvedValue(undefined),
        findPermissions: jest.fn().mockResolvedValue([]),
      },
    })
    await t.uc.execute(VALID_INPUT)
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        payload: expect.objectContaining({
          type: "password_set",
          recipientId: "admin-1",
          data: { userName: "Ana Oliveira" },
        }),
      }),
    )
  })

  it("user sem createdByUserId (seed/master): NÃO publica", async () => {
    const t = makeDeps()
    await t.uc.execute(VALID_INPUT)
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("senha fraca lança WeakPasswordError ANTES de consultar token", async () => {
    const t = makeDeps({ strength: { score: jest.fn().mockReturnValue(0) } })
    await expect(t.uc.execute({ ...VALID_INPUT, password: "123" })).rejects.toBeInstanceOf(WeakPasswordError)
    expect(t.verificationTokens.findActiveByHash).not.toHaveBeenCalled()
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
  })

  it("senha vazada lança WeakPasswordError sem tocar no token", async () => {
    const verificationTokens = {
      findActiveByHash: jest.fn(),
      consumeByHash: jest.fn(),
      invalidateAllForUser: jest.fn(),
    }
    const t = makeDeps({
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_closed",
      }),
      breach: { check: jest.fn().mockResolvedValue("breached") },
      verificationTokens,
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(WeakPasswordError)
    expect(verificationTokens.findActiveByHash).not.toHaveBeenCalled()
    expect(verificationTokens.consumeByHash).not.toHaveBeenCalled()
  })

  it("avatar de outro dono cai de volta para o avatar atual (null)", async () => {
    const t = makeDeps({
      attachments: { exists: jest.fn().mockResolvedValue(false) },
    })
    await t.uc.execute({ ...VALID_INPUT, avatarAttachmentId: "att-third-party" })
    // O user atualizado não deve ter o avatar de terceiro
    const updatedUser: User = t.users.update.mock.calls[0][0]
    expect(updatedUser.props.avatarAttachmentId).toBeNull()
  })

  it("avatar com ownership válida é mantido", async () => {
    const t = makeDeps({
      attachments: { exists: jest.fn().mockResolvedValue(true) },
    })
    await t.uc.execute({ ...VALID_INPUT, avatarAttachmentId: "att-own" })
    const updatedUser: User = t.users.update.mock.calls[0][0]
    expect(updatedUser.props.avatarAttachmentId).toBe("att-own")
  })

  it("user não encontrado (findById null) lança InvalidAccessLinkError sem consumir", async () => {
    const t = makeDeps({
      users: {
        findById: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        findPermissions: jest.fn(),
      },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
  })

  it("senha não-vazada prossegue normalmente", async () => {
    const t = makeDeps({
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_closed",
      }),
      breach: { check: jest.fn().mockResolvedValue("clear") },
    })
    await expect(t.uc.execute(VALID_INPUT)).resolves.toBeDefined()
    expect(t.verificationTokens.findActiveByHash).toHaveBeenCalled()
  })

  it("desabilitado: o breach check não é consultado", async () => {
    const check = jest.fn().mockResolvedValue("breached")
    const t = makeDeps({
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: false,
        BREACH_CHECK_MODE: "fail_closed",
      }),
      breach: { check },
    })
    await expect(t.uc.execute(VALID_INPUT)).resolves.toBeDefined()
    expect(check).not.toHaveBeenCalled()
  })

  it("habilitado em fail_open: senha vazada é barrada (o modo não decide SE consulta)", async () => {
    const check = jest.fn().mockResolvedValue("breached")
    const t = makeDeps({
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_open",
      }),
      breach: { check },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(WeakPasswordError)
    expect(check).toHaveBeenCalledWith(VALID_INPUT.password)
  })

  it("fail_open + consulta indisponível: ativação segue e grava breach_check_skipped", async () => {
    const t = makeDeps({
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_open",
      }),
      breach: { check: jest.fn().mockResolvedValue("skipped") },
    })
    await expect(t.uc.execute(VALID_INPUT)).resolves.toBeDefined()
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          eventType: "breach_check_skipped",
          metadata: { mode: "fail_open" },
        }),
      }),
    )
  })

  it("fail_closed + consulta indisponível: 503 sobe e o token não é consumido", async () => {
    const verificationTokens = {
      findActiveByHash: jest.fn(),
      consumeByHash: jest.fn(),
      invalidateAllForUser: jest.fn(),
    }
    const t = makeDeps({
      config: makeIdentityConfig({
        BREACH_CHECK_ENABLED: true,
        BREACH_CHECK_MODE: "fail_closed",
      }),
      breach: {
        check: jest.fn().mockRejectedValue(new BreachCheckUnavailableError()),
      },
      verificationTokens,
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(
      BreachCheckUnavailableError,
    )
    expect(verificationTokens.consumeByHash).not.toHaveBeenCalled()
  })

  it("TOCTOU: usuário ativado entre pre-check e tx lança InvalidAccessLinkError sem salvar", async () => {
    const active = User.createActive({
      name: "Carlos",
      email: "carlos@x.test",
      passwordHash: "argon2",
      pepperVersion: 1,
    })
    // Primeira chamada (pre-check fora da tx): retorna pending; segunda (dentro da tx): retorna active
    const findById = jest
      .fn()
      .mockResolvedValueOnce(pendingUser())
      .mockResolvedValueOnce(active)
    const t = makeDeps({
      users: { findById, update: jest.fn(), findPermissions: jest.fn() },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("avatar idêntico ao atual (submitted === current) não chama attachments.exists", async () => {
    const avatarId = "att-existente"
    const userWithAvatar = User.fromProps({
      id: "u-1",
      name: "Ana",
      email: "ana@x.test",
      emailVerified: false,
      pendingEmail: null,
      accessProfile: "admin",
      servesClients: false,
      passwordHash: null,
      pepperVersion: 1,
      status: "pending",
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastResetRequestedAt: null,
      lastVerificationRequestedAt: null,
      lastEmailChangeRequestedAt: null,
      birthDate: null,
      avatarAttachmentId: avatarId,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
      createdByUserId: null,
    })
    const existsFn = jest.fn()
    const t = makeDeps({
      users: {
        findById: jest.fn().mockResolvedValue(userWithAvatar),
        update: jest.fn().mockResolvedValue(undefined),
        findPermissions: jest.fn().mockResolvedValue([]),
      },
      attachments: { exists: existsFn },
    })
    await t.uc.execute({ ...VALID_INPUT, avatarAttachmentId: avatarId })
    expect(existsFn).not.toHaveBeenCalled()
    const updatedUser: User = t.users.update.mock.calls[0][0]
    expect(updatedUser.props.avatarAttachmentId).toBe(avatarId)
  })
})

import { describe, expect, it, vi } from "vitest"

import { User, type UserProps } from "../../../domain/entities/user.entity"
import {
  EmailAlreadyInUseError,
  InvalidEmailChangeTokenError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../testing/identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"
import { CreateSessionService } from "../../services/create-session.service"

import { ConfirmEmailChangeUseCase } from "./confirm-email-change.use-case"

const NOW = new Date("2026-06-01T12:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "argon2-hash",
    pepperVersion: 1,
    status: "pending",
    emailVerified: false,
    pendingEmail: "nova@example.com",
    accessProfile: "admin",
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: new Date("2026-06-01T10:00:00.000Z"),
    avatarAttachmentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    deletedAt: null,
    createdByUserId: null,
    ...over,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    findActiveByHash: vi.fn().mockResolvedValue({
      userId: "u-1",
      expiresAt: new Date("2026-06-02T12:00:00.000Z"),
    }),
    consumeByHash: vi.fn().mockResolvedValue({ userId: "u-1" }),
    invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
  }
  const users = over.users ?? {
    findById: vi.fn().mockResolvedValue(makeUser()),
    update: vi.fn().mockResolvedValue(undefined),
    findPermissions: vi.fn().mockResolvedValue([]),
  }
  const tokens = over.tokens ?? {
    generate: vi.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
    hashOf: vi.fn().mockReturnValue("token-hash"),
  }
  const authEvents = over.authEvents ?? {
    record: vi.fn().mockResolvedValue(undefined),
    recordInTx: vi.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx =
    over.ctx ??
    fakeRequestContext(() => ({
      ip: "1.2.3.4",
      userAgent: "jest",
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
    }))
  const sessions = over.sessions ?? {
    create: vi.fn().mockResolvedValue(undefined),
    countByUser: vi.fn().mockResolvedValue(1),
    deleteOldestOverCap: vi.fn().mockResolvedValue(undefined),
    deleteByDevice: vi.fn().mockResolvedValue(undefined),
  }
  const devices = over.devices ?? {
    findByUserAndCookieHash: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
  }

  const config = makeIdentityConfig()
  const createSession = new CreateSessionService(
    sessions,
    devices,
    tokens,
    config,
    ctx
  )

  const uc = new ConfirmEmailChangeUseCase(
    verificationTokens,
    users,
    tokens,
    authEvents,
    clock,
    ctx,
    createSession
  )

  return {
    uc,
    verificationTokens,
    users,
    tokens,
    authEvents,
    clock,
    ctx,
    sessions,
    devices,
  }
}

describe("ConfirmEmailChangeUseCase", () => {
  describe("caminho feliz", () => {
    it("confirma troca: promove pendingEmail, grava sessão e retorna user + sessionToken", async () => {
      const t = makeDeps()
      const out = await t.uc.execute({ token: "raw-token" })

      expect(out.sessionToken).toBe("raw-sess")
      expect(typeof out.sessionId).toBe("string")
      expect(out.sessionId.length).toBeGreaterThan(0)
      expect(out.user.email).toBe("nova@example.com")
      expect(t.sessions.create).toHaveBeenCalledTimes(1)
    })

    it("consome o token e invalida todos os outros tokens de email_change do usuário", async () => {
      const t = makeDeps()
      await t.uc.execute({ token: "raw-token" })

      expect(t.verificationTokens.consumeByHash).toHaveBeenCalledWith(
        "token-hash",
        "email_change",
        NOW
      )
      expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith(
        "u-1",
        "email_change"
      )
    })

    it("persiste o usuário com confirmEmailChange antes de criar sessão", async () => {
      const t = makeDeps()
      await t.uc.execute({ token: "raw-token" })

      expect(t.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            email: "nova@example.com",
            pendingEmail: null,
            status: "active",
            emailVerified: true,
          }),
        })
      )
      // update precisa ser antes de sessions.create
      expect(t.users.update.mock.invocationCallOrder[0]).toBeLessThan(
        t.sessions.create.mock.invocationCallOrder[0] ?? Infinity
      )
    })

    it("grava auth_event email_changed via recordInTx (dentro da tx)", async () => {
      const t = makeDeps()
      await t.uc.execute({ token: "raw-token" })

      expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            eventType: "email_changed",
            userId: "u-1",
          }),
        })
      )
      expect(t.authEvents.record).not.toHaveBeenCalled()
    })

    it("deviceCookie presente e conhecido: não cria device e mantém o cookie", async () => {
      const t = makeDeps({
        devices: {
          findByUserAndCookieHash: vi.fn().mockResolvedValue({
            props: {
              id: "dev-1",
              userId: "u-1",
              cookieTokenHash: "cookie-hash",
              label: null,
              firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          }),
          create: vi.fn(),
        },
        tokens: {
          generate: vi
            .fn()
            .mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
          hashOf: vi.fn().mockReturnValue("cookie-hash"),
        },
      })
      const out = await t.uc.execute({
        token: "raw-token",
        deviceCookie: "raw-cookie",
      })

      expect(t.devices.create).not.toHaveBeenCalled()
      expect(out.deviceCookie).toBe("raw-cookie")
    })
  })

  describe("pré-check fora da tx: findActiveByHash nulo", () => {
    it("token inexistente/expirado/consumido lança InvalidEmailChangeTokenError antes da tx", async () => {
      const t = makeDeps({
        verificationTokens: {
          findActiveByHash: vi.fn().mockResolvedValue(null),
          consumeByHash: vi.fn(),
          invalidateAllForUser: vi.fn(),
        },
      })

      await expect(t.uc.execute({ token: "bad-token" })).rejects.toBeInstanceOf(
        InvalidEmailChangeTokenError
      )
      // Tx não foi iniciada — consume não é chamado
      expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
      expect(t.users.update).not.toHaveBeenCalled()
    })

    it("token válido mas usuário sem pendingEmail lança InvalidEmailChangeTokenError no pré-check", async () => {
      const userSemPendente = makeUser({
        pendingEmail: null,
        status: "active",
        emailVerified: true,
      })
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(userSemPendente),
          update: vi.fn(),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
        verificationTokens: {
          findActiveByHash: vi.fn().mockResolvedValue({
            userId: "u-1",
            expiresAt: new Date("2026-06-02T12:00:00.000Z"),
          }),
          consumeByHash: vi.fn(),
          invalidateAllForUser: vi.fn(),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
        InvalidEmailChangeTokenError
      )
      expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
      expect(t.users.update).not.toHaveBeenCalled()
    })

    it("token válido mas usuário inexistente lança InvalidEmailChangeTokenError no pré-check", async () => {
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
        verificationTokens: {
          findActiveByHash: vi.fn().mockResolvedValue({
            userId: "u-1",
            expiresAt: new Date("2026-06-02T12:00:00.000Z"),
          }),
          consumeByHash: vi.fn(),
          invalidateAllForUser: vi.fn(),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
        InvalidEmailChangeTokenError
      )
      expect(t.verificationTokens.consumeByHash).not.toHaveBeenCalled()
    })
  })

  describe("dentro da tx: consumeByHash nulo (race condition)", () => {
    it("token consumido por outro request entre pré-check e tx lança InvalidEmailChangeTokenError", async () => {
      // findActiveByHash retorna ok (pré-check passa), consumeByHash retorna null (race)
      const t = makeDeps({
        verificationTokens: {
          findActiveByHash: vi.fn().mockResolvedValue({
            userId: "u-1",
            expiresAt: new Date("2026-06-02T12:00:00.000Z"),
          }),
          consumeByHash: vi.fn().mockResolvedValue(null),
          invalidateAllForUser: vi.fn(),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
        InvalidEmailChangeTokenError
      )
      expect(t.users.update).not.toHaveBeenCalled()
      expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
    })

    it("consumeByHash retorna userId mas user não tem pendingEmail (estado corrompido): lança InvalidEmailChangeTokenError", async () => {
      const userSemPendente = makeUser({
        pendingEmail: null,
        status: "active",
        emailVerified: true,
      })
      const findByIdMock = vi
        .fn()
        // primeira chamada = pré-check (user com pendingEmail)
        .mockResolvedValueOnce(makeUser())
        // segunda chamada = dentro da tx (estado diferente)
        .mockResolvedValueOnce(userSemPendente)

      const t = makeDeps({
        users: {
          findById: findByIdMock,
          update: vi.fn(),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
        InvalidEmailChangeTokenError
      )
      expect(t.users.update).not.toHaveBeenCalled()
    })

    it("consumeByHash retorna token mas findById retorna null dentro da tx: lança InvalidEmailChangeTokenError", async () => {
      const findByIdMock = vi
        .fn()
        .mockResolvedValueOnce(makeUser())
        .mockResolvedValueOnce(null)

      const t = makeDeps({
        users: {
          findById: findByIdMock,
          update: vi.fn(),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
        InvalidEmailChangeTokenError
      )
      expect(t.users.update).not.toHaveBeenCalled()
    })
  })

  describe("colisão de e-mail (unique violation 23505)", () => {
    it("e-mail tomado entre pedido e confirmação lança EmailAlreadyInUseError", async () => {
      const pgUniqueError = Object.assign(new Error("unique violation"), {
        code: "23505",
      })
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(makeUser()),
          update: vi.fn().mockRejectedValue(pgUniqueError),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeInstanceOf(
        EmailAlreadyInUseError
      )
      // Sessão NÃO é criada quando o update falha
      expect(t.sessions.create).not.toHaveBeenCalled()
      expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
    })

    it("erro de DB genérico (não unique) é relançado sem ser convertido", async () => {
      const dbError = Object.assign(new Error("connection error"), {
        code: "08006",
      })
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(makeUser()),
          update: vi.fn().mockRejectedValue(dbError),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBe(dbError)
    })

    it("update rejeita com null: relança null sem converter (isUniqueViolation: error !== null = false)", async () => {
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(makeUser()),
          update: vi.fn().mockRejectedValue(null),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBeNull()
    })

    it("update rejeita com string: relança sem converter (isUniqueViolation: typeof !== object)", async () => {
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(makeUser()),
          update: vi.fn().mockRejectedValue("db failure"),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBe(
        "db failure"
      )
    })

    it("update rejeita com objeto sem propriedade code: relança sem converter", async () => {
      const errorSemCode = new Error("unexpected")
      const t = makeDeps({
        users: {
          findById: vi.fn().mockResolvedValue(makeUser()),
          update: vi.fn().mockRejectedValue(errorSemCode),
          findPermissions: vi.fn().mockResolvedValue([]),
        },
      })

      await expect(t.uc.execute({ token: "raw-token" })).rejects.toBe(
        errorSemCode
      )
    })
  })
})

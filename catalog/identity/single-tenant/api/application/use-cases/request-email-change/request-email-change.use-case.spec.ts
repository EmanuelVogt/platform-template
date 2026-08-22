import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import {
  EmailAlreadyInUseError,
  EmailUnchangedError,
  InvalidCredentialsError,
  RateLimitedError,
} from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { RequestEmailChangeUseCase } from "./request-email-change.use-case"

const NOW = new Date("2026-06-01T12:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "argon2-real",
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
  const authedStore = {
    ip: "1.2.3.4",
    userAgent: "jest",
    correlationId: "corr-1",
    locale: "pt-BR" as const,
    userId: "u-1",
    sessionId: "sess-1",
  }

  const users = over.users ?? {
    findById: jest.fn().mockResolvedValue(makeUser()),
    findByIdForUpdate: jest.fn().mockResolvedValue(makeUser()),
    findByEmail: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
  }
  const sessions = over.sessions ?? {
    deleteAllForUser: jest.fn().mockResolvedValue(undefined),
  }
  const verificationTokens = over.verificationTokens ?? {
    invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  }
  const tokens = over.tokens ?? {
    generate: jest.fn().mockReturnValue({ raw: "raw-tok", hash: "hash-tok" }),
  }
  const hasher = over.hasher ?? {
    verify: jest.fn().mockResolvedValue(true),
  }
  const outbox = over.outbox ?? {
    publish: jest.fn().mockResolvedValue(undefined),
  }
  const authEvents = over.authEvents ?? {
    recordInTx: jest.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx = over.ctx ?? fakeRequestContext(() => authedStore)
  const config = makeIdentityConfig(over.config ?? {})

  const uc = new RequestEmailChangeUseCase(
    users,
    sessions,
    verificationTokens,
    tokens,
    hasher,
    outbox,
    authEvents,
    clock,
    ctx,
    config,
  )
  return { uc, users, sessions, verificationTokens, tokens, hasher, outbox, authEvents, clock, ctx }
}

describe("RequestEmailChangeUseCase", () => {
  describe("caminho feliz", () => {
    it("troca solicitada: desativa conta, invalida tokens, cria novo token, deloga, publica 2 notificações e grava evento", async () => {
      const t = makeDeps()
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).resolves.toBeUndefined()

      expect(t.users.update).toHaveBeenCalledTimes(1)
      expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith("u-1", "email_change")
      expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
      expect(t.sessions.deleteAllForUser).toHaveBeenCalledWith("u-1")
      expect(t.outbox.publish).toHaveBeenCalledTimes(2)
      expect(t.outbox.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: "email_change_requested" }),
        }),
      )
      expect(t.outbox.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: "email_change_notice" }),
        }),
      )
      expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({ eventType: "email_change_requested" }),
        }),
      )
    })

    it("link enviado ao novo e-mail contém o token raw e a URL configurada", async () => {
      const t = makeDeps()
      await t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" })
      const call = t.outbox.publish.mock.calls.find(
        ([ev]: [any]) => ev.payload?.type === "email_change_requested",
      )
      expect(call).toBeDefined()
      const data = call[0].payload.data as Record<string, unknown>
      expect(data.link).toContain("raw-tok")
      expect(data.link).toContain("http://localhost:5173")
      expect(data.email).toBe("novo@example.com")
    })

    it("e-mail novo é normalizado (trim + lowercase) antes de comparar e persistir", async () => {
      const t = makeDeps()
      await t.uc.execute({ currentPassword: "senha-ok", newEmail: "  NOVO@Example.COM  " })
      expect(t.users.update).toHaveBeenCalledTimes(1)
    })
  })

  describe("ForbiddenError — contexto não autenticado", () => {
    it("lança ForbiddenError quando não há userId no contexto", async () => {
      const t = makeDeps({
        ctx: fakeRequestContext(() => ({
            ip: "1.2.3.4",
            userAgent: "jest",
            correlationId: "c1",
            locale: "pt-BR",
            userId: null,
            sessionId: null,
          })),
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(ForbiddenError)
      expect(t.users.findById).not.toHaveBeenCalled()
    })

    it("lança ForbiddenError quando usuário não é encontrado no repositório", async () => {
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(null),
          findByEmail: jest.fn(),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(ForbiddenError)
      expect(t.hasher.verify).not.toHaveBeenCalled()
    })
  })

  describe("InvalidCredentialsError — senha", () => {
    it("lança InvalidCredentialsError quando usuário não tem passwordHash (conta sem senha)", async () => {
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(makeUser({ passwordHash: null })),
          findByEmail: jest.fn(),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "qualquer", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
      expect(t.hasher.verify).not.toHaveBeenCalled()
    })

    it("lança InvalidCredentialsError quando senha está errada", async () => {
      const t = makeDeps({
        hasher: { verify: jest.fn().mockResolvedValue(false) },
      })
      await expect(
        t.uc.execute({ currentPassword: "errada", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
      expect(t.users.update).not.toHaveBeenCalled()
      expect(t.sessions.deleteAllForUser).not.toHaveBeenCalled()
    })
  })

  describe("EmailUnchangedError", () => {
    it("lança EmailUnchangedError quando novo e-mail é igual ao atual (após normalização)", async () => {
      const t = makeDeps()
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "ANA@EXAMPLE.COM" }),
      ).rejects.toBeInstanceOf(EmailUnchangedError)
      expect(t.users.update).not.toHaveBeenCalled()
    })
  })

  describe("RateLimitedError — cooldown", () => {
    it("lança RateLimitedError quando solicitação está dentro do cooldown", async () => {
      const tenSecondsAgo = new Date(NOW.getTime() - 10_000)
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: tenSecondsAgo }),
          ),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(RateLimitedError)
      expect(t.users.update).not.toHaveBeenCalled()
    })

    it("retryAfterSeconds reflete o tempo restante do cooldown", async () => {
      const tenSecondsAgo = new Date(NOW.getTime() - 10_000)
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: tenSecondsAgo }),
          ),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
        config: { EMAIL_CHANGE_COOLDOWN_SECONDS: 60 },
      })
      const err = await t.uc
        .execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" })
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(RateLimitedError)
      // 60s - 10s = 50s restantes
      expect((err as RateLimitedError).retryAfterSeconds).toBe(50)
    })

    it("não aplica cooldown quando lastEmailChangeRequestedAt é null (primeira solicitação)", async () => {
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: null }),
          ),
          findByIdForUpdate: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: null }),
          ),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(undefined),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).resolves.toBeUndefined()
    })

    it("permite solicitação após cooldown expirado", async () => {
      const longAgo = new Date(NOW.getTime() - 120_000)
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: longAgo }),
          ),
          findByIdForUpdate: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: longAgo }),
          ),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(undefined),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).resolves.toBeUndefined()
    })

    it("não lança RateLimitedError quando elapsed é exatamente igual ao windowMs (boundary)", async () => {
      // elapsed === windowMs → condição `elapsed < windowMs` é false → não lança
      const exactlyAtCooldown = new Date(NOW.getTime() - 60_000)
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: exactlyAtCooldown }),
          ),
          findByIdForUpdate: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: exactlyAtCooldown }),
          ),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(undefined),
        },
        config: { EMAIL_CHANGE_COOLDOWN_SECONDS: 60 },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).resolves.toBeUndefined()
    })

    it("lança RateLimitedError com retryAfterSeconds calculado via Math.ceil (fração de segundo)", async () => {
      // elapsed = 59.5s, windowMs = 60_000ms → retryAfterSeconds = ceil(0.5) = 1
      const halfSecondShort = new Date(NOW.getTime() - 59_500)
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(
            makeUser({ lastEmailChangeRequestedAt: halfSecondShort }),
          ),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
        config: { EMAIL_CHANGE_COOLDOWN_SECONDS: 60 },
      })
      const err = await t.uc
        .execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" })
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(RateLimitedError)
      expect((err as RateLimitedError).retryAfterSeconds).toBe(1)
    })
  })

  describe("endereço recusado: 409 único e cooldown gravado", () => {
    it("e-mail de usuário ativo → EmailAlreadyInUseError com o cooldown gravado", async () => {
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(makeUser()),
          findByEmail: jest.fn().mockResolvedValue(makeUser({ id: "u-2", email: "novo@example.com" })),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(EmailAlreadyInUseError)
      expect(t.users.update).toHaveBeenCalledTimes(1)
      const saved = t.users.update.mock.calls[0][0] as User
      expect(saved.props.lastEmailChangeRequestedAt).toEqual(NOW)
      expect(saved.props.pendingEmail).toBeNull()
      expect(saved.props.status).toBe("active")
    })

    it("e-mail de usuário excluído → MESMO erro e MESMO cooldown", async () => {
      const deletedUser = makeUser({
        id: "u-2",
        email: "novo@example.com",
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(makeUser()),
          findByEmail: jest.fn().mockResolvedValue(deletedUser),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(EmailAlreadyInUseError)
      const saved = t.users.update.mock.calls[0][0] as User
      expect(saved.props.lastEmailChangeRequestedAt).toEqual(NOW)
    })

    it("segunda sondagem em seguida bate no cooldown (429), não em outro 409", async () => {
      const t = makeDeps({
        users: {
          findById: jest
            .fn()
            .mockResolvedValue(makeUser({ lastEmailChangeRequestedAt: NOW })),
          findByEmail: jest.fn().mockResolvedValue(makeUser({ id: "u-2", email: "novo@example.com" })),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toBeInstanceOf(RateLimitedError)
      expect(t.users.findByEmail).not.toHaveBeenCalled()
      expect(t.users.update).not.toHaveBeenCalled()
    })
  })

  describe("asserts negativos — nenhuma escrita em falha", () => {
    it("ForbiddenError (sem userId): nenhuma porta de escrita chamada", async () => {
      const t = makeDeps({
        ctx: fakeRequestContext(() => ({ ip: "x", userAgent: "x", correlationId: "x", locale: "pt-BR", userId: null, sessionId: null })),
      })
      await expect(t.uc.execute({ currentPassword: "x", newEmail: "x@x.com" })).rejects.toThrow()
      expect(t.users.update).not.toHaveBeenCalled()
      expect(t.verificationTokens.create).not.toHaveBeenCalled()
      expect(t.sessions.deleteAllForUser).not.toHaveBeenCalled()
      expect(t.outbox.publish).not.toHaveBeenCalled()
      expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
    })

    it("InvalidCredentialsError (senha errada): nenhuma porta de escrita chamada", async () => {
      const t = makeDeps({ hasher: { verify: jest.fn().mockResolvedValue(false) } })
      await expect(
        t.uc.execute({ currentPassword: "errada", newEmail: "novo@example.com" }),
      ).rejects.toThrow()
      expect(t.users.update).not.toHaveBeenCalled()
      expect(t.verificationTokens.create).not.toHaveBeenCalled()
      expect(t.sessions.deleteAllForUser).not.toHaveBeenCalled()
      expect(t.outbox.publish).not.toHaveBeenCalled()
      expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
    })

    it("RateLimitedError: nenhuma porta de escrita chamada", async () => {
      const tenSecondsAgo = new Date(NOW.getTime() - 10_000)
      const t = makeDeps({
        users: {
          findById: jest.fn().mockResolvedValue(makeUser({ lastEmailChangeRequestedAt: tenSecondsAgo })),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ currentPassword: "senha-ok", newEmail: "novo@example.com" }),
      ).rejects.toThrow()
      expect(t.users.update).not.toHaveBeenCalled()
      expect(t.sessions.deleteAllForUser).not.toHaveBeenCalled()
      expect(t.outbox.publish).not.toHaveBeenCalled()
    })
  })
})

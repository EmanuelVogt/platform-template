import { Device } from "../../../domain/entities/device.entity"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import { InvalidCredentialsError, RateLimitedError } from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"
import { CreateSessionService } from "../../services/create-session.service"

import { LoginUseCase } from "./login.use-case"


const DUMMY_HASH = "argon2-dummy"
const ACCOUNT_KEY = "login:acct:ana@example.com"
const IP_KEY = "login:1.2.3.4:ana@example.com"

/** Limiter que só nega as chaves listadas — separa o bucket de conta do de IP. */
function limiterDenying(denied: Record<string, number>) {
  return {
    consume: jest.fn((key: string) =>
      Promise.resolve(
        key in denied
          ? { allowed: false, retryAfterSeconds: denied[key] as number }
          : { allowed: true, retryAfterSeconds: 0 },
      ),
    ),
    reset: jest.fn().mockResolvedValue(undefined),
  }
}


function makeUser(over: { props?: Partial<UserProps> } = {}): User {
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
    ...over.props,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? {
    findByEmail: jest.fn().mockResolvedValue(makeUser()),
    findByIdForUpdate: jest.fn().mockResolvedValue(makeUser()),
    update: jest.fn().mockResolvedValue(undefined),
    registerFailedAttempt: jest.fn().mockResolvedValue(undefined),
    findPermissions: jest.fn().mockResolvedValue([]),
  }
  const sessions = over.sessions ?? {
    create: jest.fn().mockResolvedValue(undefined),
    countByUser: jest.fn().mockResolvedValue(1),
    deleteOldestOverCap: jest.fn().mockResolvedValue(undefined),
    deleteByDevice: jest.fn().mockResolvedValue(undefined),
  }
  const hasher = over.hasher ?? {
    verify: jest.fn().mockResolvedValue(true),
    needsRehash: jest.fn().mockReturnValue(false),
    hash: jest.fn().mockResolvedValue("argon2-rehashed"),
  }
  const tokens = over.tokens ?? {
    generate: jest.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
    hashOf: jest.fn().mockReturnValue("email-hash"),
  }
  const rateLimiter = over.rateLimiter ?? {
    consume: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    reset: jest.fn().mockResolvedValue(undefined),
  }
  const authEvents = over.authEvents ?? {
    record: jest.fn().mockResolvedValue(undefined),
    recordInTx: jest.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => new Date("2026-05-30T00:00:00.000Z") }
  const ctx = over.ctx ?? fakeRequestContext(() => ({
      ip: "1.2.3.4",
      userAgent: "jest",
      correlationId: "c1",
      locale: "pt-BR",
      userId: null,
      sessionId: null,
    }))
  const outbox = over.outbox ?? { publish: jest.fn().mockResolvedValue(undefined) }
  const devices = over.devices ?? {
    findByUserAndCookieHash: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(undefined),
  }
  const config = makeIdentityConfig()
  const createSession = new CreateSessionService(sessions, devices, tokens, config, ctx)
  const uc = new LoginUseCase(
    users,
    hasher,
    tokens,
    rateLimiter,
    authEvents,
    clock,
    ctx,
    config,
    outbox,
    createSession,
  )
  Reflect.set(uc, "dummyHash", DUMMY_HASH)
  return { uc, users, sessions, devices, hasher, tokens, rateLimiter, authEvents, clock, ctx, outbox }
}


describe("LoginUseCase", () => {
  it("credenciais válidas retornam user + sessionToken raw e criam sessão", async () => {
    const t = makeDeps()
    const out = await t.uc.execute({
      email: "ana@example.com",
      password: "ok",
      rememberMe: true,
    })
    expect(out.sessionToken).toBe("raw-sess")
    expect(t.sessions.create).toHaveBeenCalledTimes(1)
    // sessionId (PK) volta no output p/ o controller assinar o cookie CSRF.
    expect(typeof out.sessionId).toBe("string")
    expect(out.sessionId.length).toBeGreaterThan(0)
    // Fonte única: ip/userAgent da sessão vêm do ctx, não de input.
    const created = t.sessions.create.mock.calls[0]?.[0] as {
      props: { ipAddress: string | null; userAgent: string | null }
    }
    expect(created.props.ipAddress).toBe("1.2.3.4")
    expect(created.props.userAgent).toBe("jest")
    // login_success é atrelado à tx (recordInTx); record (raiz) é só do caminho de falha.
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "login_success" }),
      }),
    )
    expect(t.authEvents.record).not.toHaveBeenCalled()
  })

  it("rate-limit estourado lança SEM chamar verify (pré-argon2)", async () => {
    const t = makeDeps({ rateLimiter: limiterDenying({ [IP_KEY]: 30 }) })
    await expect(
      t.uc.execute({
        email: "ana@example.com",
        password: "x",
        rememberMe: false,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.hasher.verify).not.toHaveBeenCalled()
    // rate_limited_burst persiste FORA da tx (record), nunca via recordInTx.
    expect(t.authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "rate_limited_burst" }),
      }),
    )
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  describe("bucket por conta (REM-01..03)", () => {
    it("estouro do bucket da conta é 429 antes do lookup, sem verify", async () => {
      const t = makeDeps({ rateLimiter: limiterDenying({ [ACCOUNT_KEY]: 42 }) })

      const error = await t.uc
        .execute({ email: "ana@example.com", password: "x", rememberMe: false })
        .then(() => null)
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RateLimitedError)
      expect(error).toMatchObject({ status: 429, retryAfterSeconds: 42 })

      expect(t.rateLimiter.consume).toHaveBeenNthCalledWith(
        1,
        ACCOUNT_KEY,
        10,
        900,
        { critical: true },
      )
      expect(t.users.findByEmail).not.toHaveBeenCalled()
      expect(t.hasher.verify).not.toHaveBeenCalled()
      expect(t.authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            eventType: "rate_limited_burst",
            userId: null,
            metadata: { retryAfterSeconds: 42, scope: "account" },
          }),
        }),
      )
    })

    it("e-mail desconhecido é negado de forma idêntica ao existente", async () => {
      const known = makeDeps({ rateLimiter: limiterDenying({ [ACCOUNT_KEY]: 42 }) })
      const unknownKey = "login:acct:nao-existe@example.com"
      const unknown = makeDeps({
        rateLimiter: limiterDenying({ [unknownKey]: 42 }),
        users: { findByEmail: jest.fn().mockResolvedValue(null), update: jest.fn() },
      })

      const errorOf = async (t: ReturnType<typeof makeDeps>, email: string) =>
        t.uc
          .execute({ email, password: "x", rememberMe: false })
          .then(() => null)
          .catch((e: RateLimitedError) => ({
            name: e.constructor.name,
            status: e.status,
            retryAfterSeconds: e.retryAfterSeconds,
            message: e.message,
          }))

      expect(await errorOf(unknown, "nao-existe@example.com")).toEqual(
        await errorOf(known, "ana@example.com"),
      )
      expect(unknown.users.findByEmail).not.toHaveBeenCalled()
    })

    it("a chave da conta usa o e-mail normalizado — o mesmo do repositório", async () => {
      const t = makeDeps()
      await t.uc.execute({
        email: "  ANA@Example.COM  ",
        password: "ok",
        rememberMe: false,
      })
      expect(t.rateLimiter.consume.mock.calls[0]?.[0]).toBe(ACCOUNT_KEY)
      expect(t.users.findByEmail).toHaveBeenCalledWith("ana@example.com")
    })

    it("login bem-sucedido limpa o bucket da conta", async () => {
      const t = makeDeps()
      await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
      })
      expect(t.rateLimiter.reset).toHaveBeenCalledWith(ACCOUNT_KEY)
    })

    it("login falho NÃO limpa o bucket da conta", async () => {
      const t = makeDeps({
        hasher: {
          verify: jest.fn().mockResolvedValue(false),
          needsRehash: () => false,
          hash: jest.fn(),
        },
      })
      await expect(
        t.uc.execute({ email: "ana@example.com", password: "wrong", rememberMe: false }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
      expect(t.rateLimiter.reset).not.toHaveBeenCalled()
    })

    it("os dois buckets negando devolve o 429 da conta (edge case)", async () => {
      const t = makeDeps({
        rateLimiter: limiterDenying({ [ACCOUNT_KEY]: 42, [IP_KEY]: 30 }),
      })
      await expect(
        t.uc.execute({ email: "ana@example.com", password: "x", rememberMe: false }),
      ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 })
      expect(t.authEvents.record).toHaveBeenCalledTimes(1)
      expect(t.authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            metadata: { retryAfterSeconds: 42, scope: "account" },
          }),
        }),
      )
    })

    it("o burst por IP é critical — o teto sobrevive à queda do Redis", async () => {
      const t = makeDeps()
      await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
      })
      expect(t.rateLimiter.consume).toHaveBeenNthCalledWith(2, IP_KEY, 30, 60, {
        critical: true,
      })
    })
  })

  it("usuário inexistente: roda verify dummy e lança InvalidCredentialsError", async () => {
    const t = makeDeps({
      users: { findByEmail: jest.fn().mockResolvedValue(null), update: jest.fn() },
    })
    await expect(
      t.uc.execute({
        email: "no@example.com",
        password: "x",
        rememberMe: false,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.hasher.verify).toHaveBeenCalledWith("x", DUMMY_HASH)
  })

  it("conta com lockedUntil: senha correta entra e limpa o lockout", async () => {
    const locked = makeUser({
      props: { lockedUntil: new Date("2026-05-30T01:00:00.000Z"), failedLoginAttempts: 5 },
    })
    const t = makeDeps({
      users: {
        findByEmail: jest.fn().mockResolvedValue(locked),
        findByIdForUpdate: jest.fn().mockResolvedValue(locked),
        update: jest.fn().mockResolvedValue(undefined),
        findPermissions: jest.fn().mockResolvedValue([]),
      },
    })
    const out = await t.uc.execute({
      email: "ana@example.com",
      password: "ok",
      rememberMe: false,
    })
    expect(out.sessionToken).toBe("raw-sess")
    expect(t.hasher.verify).toHaveBeenCalledWith("ok", "argon2-real")
    expect(t.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      }),
    )
  })

  it("senha errada: grava login_failed FORA da tx e NÃO incrementa lockout", async () => {
    const t = makeDeps({
      hasher: {
        verify: jest.fn().mockResolvedValue(false),
        needsRehash: () => false,
        hash: jest.fn(),
      },
    })
    await expect(
      t.uc.execute({
        email: "ana@example.com",
        password: "wrong",
        rememberMe: false,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(t.authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "login_failed" }),
      }),
    )
    expect(t.users.registerFailedAttempt).not.toHaveBeenCalled()
    expect(t.authEvents.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "account_locked" }),
      }),
    )
    expect(t.outbox.publish).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("usuário pending (sem senha) é rejeitado com InvalidCredentialsError", async () => {
    const t = makeDeps({
      users: {
        findByEmail: jest.fn().mockResolvedValue(
          User.create({ name: "Ana", email: "ana@x.test", accessProfile: "admin" }),
        ),
        registerFailedAttempt: jest.fn().mockResolvedValue(null),
      },
    })
    await expect(
      t.uc.execute({ email: "ana@x.test", password: "qualquer-senha", rememberMe: false }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it("rehash-on-login: needsRehash true re-hasheia e persiste", async () => {
    const t = makeDeps({
      hasher: {
        verify: jest.fn().mockResolvedValue(true),
        needsRehash: () => true,
        hash: jest.fn().mockResolvedValue("argon2-new"),
      },
    })
    await t.uc.execute({
      email: "ana@example.com",
      password: "ok",
      rememberMe: false,
    })
    expect(t.hasher.hash).toHaveBeenCalledWith("ok")
    expect(t.users.update).toHaveBeenCalled()
  })

  describe("resolução de device", () => {
    it("reusa o device quando o cookie casa (hit) — não cria, mantém o cookie", async () => {
      const existing = Device.fromProps({
        id: "dev-1",
        userId: "u-1",
        cookieTokenHash: "h",
        label: null,
        firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      const t = makeDeps({
        devices: {
          findByUserAndCookieHash: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
        },
        tokens: {
          generate: jest.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
          hashOf: jest.fn().mockReturnValue("h"),
        },
      })
      const out = await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
        deviceCookie: "raw-cookie",
      })
      expect(t.devices.create).not.toHaveBeenCalled()
      expect(out.deviceCookie).toBe("raw-cookie")
      const created = t.sessions.create.mock.calls[0]?.[0] as {
        props: { deviceId: string | null }
      }
      expect(created.props.deviceId).toBe("dev-1")
    })

    it("sem cookie (miss): gera token novo e cria device", async () => {
      const t = makeDeps({
        tokens: {
          generate: jest.fn().mockReturnValue({ raw: "new-raw", hash: "new-hash" }),
          hashOf: jest.fn().mockReturnValue("email-hash"),
        },
      })
      const out = await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
        deviceCookie: null,
      })
      expect(t.devices.create).toHaveBeenCalled()
      expect(out.deviceCookie).toBe("new-raw")
    })

    it("cookie de outro user: cria row nova com o MESMO hash, mantém o cookie", async () => {
      const t = makeDeps({
        devices: {
          findByUserAndCookieHash: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(undefined),
        },
        tokens: {
          generate: jest.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
          hashOf: jest.fn().mockReturnValue("shared-hash"),
        },
      })
      const out = await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
        deviceCookie: "shared-raw",
      })
      expect(t.devices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({ cookieTokenHash: "shared-hash" }),
        }),
      )
      expect(out.deviceCookie).toBe("shared-raw")
    })

    it("relogin com device conhecido revoga as sessões anteriores do device", async () => {
      const existing = Device.fromProps({
        id: "dev-1",
        userId: "u-1",
        cookieTokenHash: "h",
        label: null,
        firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      const t = makeDeps({
        devices: {
          findByUserAndCookieHash: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
        },
        tokens: {
          generate: jest.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
          hashOf: jest.fn().mockReturnValue("h"),
        },
      })
      await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
        deviceCookie: "raw-cookie",
      })
      expect(t.sessions.deleteByDevice).toHaveBeenCalledWith("dev-1")
      // Revoga ANTES de criar a nova sessão — senão a recém-criada morreria junto.
      expect(t.sessions.deleteByDevice.mock.invocationCallOrder[0]).toBeLessThan(
        t.sessions.create.mock.invocationCallOrder[0] ?? 0,
      )
    })

    it("device novo não revoga sessão nenhuma", async () => {
      const t = makeDeps()
      await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
        deviceCookie: null,
      })
      expect(t.sessions.deleteByDevice).not.toHaveBeenCalled()
    })
  })

  describe("produtor device_new_login", () => {
    it("login sem device cookie publica device_new_login", async () => {
      const t = makeDeps()
      await t.uc.execute({ email: "ana@example.com", password: "ok", rememberMe: false })
      expect(t.outbox.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "notification.requested",
          payload: expect.objectContaining({
            type: "device_new_login",
            recipientId: "u-1",
            data: expect.objectContaining({
              email: "ana@example.com",
              deviceLabel: expect.any(String),
              at: expect.any(String),
            }),
          }),
        }),
      )
    })

    it("login com device cookie CONHECIDO não publica", async () => {
      const t = makeDeps({
        devices: {
          findByUserAndCookieHash: jest.fn().mockResolvedValue({
            props: { id: "d-1" },
          }),
          create: jest.fn(),
        },
      })
      await t.uc.execute({
        email: "ana@example.com",
        password: "ok",
        rememberMe: false,
        deviceCookie: "known-raw",
      })
      expect(t.outbox.publish).not.toHaveBeenCalled()
    })
  })
})

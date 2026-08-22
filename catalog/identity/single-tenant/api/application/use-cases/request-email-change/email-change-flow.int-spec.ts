import { ulid } from "ulid"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
  truncateKernel,
} from "../../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../../test/setup/test-logger"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../../domain/entities/user.entity"
import { VerificationToken } from "../../../domain/entities/verification-token.entity"
import {
  EmailAlreadyInUseError,
  EmailUnchangedError,
  InvalidCredentialsError,
  InvalidEmailChangeTokenError,
  RateLimitedError,
} from "../../../domain/errors"
import { parseIdentityConfig } from "../../../identity.config"
import { Argon2PasswordHasher } from "../../../infrastructure/hashing/argon2-password-hasher"
import { CryptoTokenGenerator } from "../../../infrastructure/hashing/crypto-token-generator"
import { DrizzleAuthEventRepository } from "../../../infrastructure/repositories/drizzle-auth-event.repository"
import { DrizzleDeviceRepository } from "../../../infrastructure/repositories/drizzle-device.repository"
import { DrizzleSessionRepository } from "../../../infrastructure/repositories/drizzle-session.repository"
import { DrizzleUserRepository } from "../../../infrastructure/repositories/drizzle-user.repository"
import { DrizzleVerificationTokenRepository } from "../../../infrastructure/repositories/drizzle-verification-token.repository"
import { IDENTITY_SESSION } from "../../identity-context"
import { RevertExpiredEmailChangesJob } from "../../jobs/revert-expired-email-changes.job"
import { CreateSessionService } from "../../services/create-session.service"
import { ConfirmEmailChangeUseCase } from "../confirm-email-change/confirm-email-change.use-case"

import { RequestEmailChangeUseCase } from "./request-email-change.use-case"

import type { DrizzleDb } from "../../../../../shared/infra/database/drizzle.provider"
import type { RequestContext, RequestContextStore  } from "../../../../../shared/kernel/context/request-context"
import type { Pool } from "pg"

const PEPPER = "p".repeat(32)
const PASSWORD = "senha-segura-123"

const config = parseIdentityConfig({
  WEB_ORIGIN: "http://localhost:5173",
  PASSWORD_PEPPER: PEPPER,
  CSRF_SECRET: "y".repeat(32),
  BREACH_CHECK_MODE: "fail_open",
  COOKIE_SECURE: "false",
  COOKIE_NAME: "rit_session",
  DEVICE_COOKIE_NAME: "rit_device",
  EMAIL_CHANGE_TOKEN_TTL_SECONDS: "3600",
  EMAIL_CHANGE_COOLDOWN_SECONDS: "1", // mínimo positivo; testes não testam cooldown
})

function authedStore(userId: string): RequestContextStore {
  return {
    requestId: "req-test",
    correlationId: "c-test",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    actor: { id: userId, kind: "user" },
    extensions: new Map([
      [IDENTITY_SESSION, { sessionId: "sess-test", deviceId: null }],
    ]),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

async function seedActiveUser(
  usersRepo: DrizzleUserRepository,
  hasher: Argon2PasswordHasher,
  email = "user@example.com",
): Promise<User> {
  const hash = await hasher.hash(PASSWORD)
  const user = User.fromProps({
    id: ulid(),
    name: "Fulano",
    email,
    passwordHash: hash,
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
  })
  await usersRepo.insert(user)
  return user
}

describe("Fluxo de troca de e-mail (int)", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager
  let ctx: RequestContext
  let usersRepo: DrizzleUserRepository
  let sessionsRepo: DrizzleSessionRepository
  let devicesRepo: DrizzleDeviceRepository
  let verificationTokensRepo: DrizzleVerificationTokenRepository
  let authEventsRepo: DrizzleAuthEventRepository
  let hasher: Argon2PasswordHasher
  let tokenGen: CryptoTokenGenerator
  let outbox: OutboxPublisher

  let requestEmailChange: RequestEmailChangeUseCase
  let confirmEmailChange: ConfirmEmailChangeUseCase
  let revertJob: RevertExpiredEmailChangesJob

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const { ctx: logCtx, loggerFactory } = makeTestLogger()
    ctx = logCtx
    txm = new TransactionManager(db, loggerFactory)
    txm.onModuleInit()

    hasher = new Argon2PasswordHasher({
      pepper: PEPPER,
      memoryKib: 19456, // mínimo OWASP — rápido em teste
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
      saltLength: 16,
    })
    tokenGen = new CryptoTokenGenerator()
    outbox = new OutboxPublisher(txm, ctx, loggerFactory)

    usersRepo = new DrizzleUserRepository(txm)
    sessionsRepo = new DrizzleSessionRepository(txm)
    devicesRepo = new DrizzleDeviceRepository(txm)
    authEventsRepo = new DrizzleAuthEventRepository(txm)
    verificationTokensRepo = new DrizzleVerificationTokenRepository(txm)

    const createSession = new CreateSessionService(
      sessionsRepo,
      devicesRepo,
      tokenGen,
      config,
      ctx,
    )

    requestEmailChange = new RequestEmailChangeUseCase(
      usersRepo,
      sessionsRepo,
      verificationTokensRepo,
      tokenGen,
      hasher,
      outbox,
      authEventsRepo,
      { now: () => new Date() },
      ctx,
      config,
    )

    confirmEmailChange = new ConfirmEmailChangeUseCase(
      verificationTokensRepo,
      usersRepo,
      tokenGen,
      authEventsRepo,
      { now: () => new Date() },
      ctx,
      createSession,
    )

    revertJob = new RevertExpiredEmailChangesJob(usersRepo, { now: () => new Date() }, loggerFactory)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
    await truncateKernel(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("caso 1: happy path — user vira pending, pendingEmail atualizado, sessões deletadas, outbox com 2 eventos", async () => {
    const user = await seedActiveUser(usersRepo, hasher)

    // device deve existir antes da sessão (FK identity.sessions.device_id)
    const devId = ulid()
    await pool.query(
      `INSERT INTO identity.devices (id, user_id, cookie_token_hash, created_at) VALUES ($1, $2, 'devhash', now())`,
      [devId, user.props.id],
    )
    await pool.query(
      `INSERT INTO identity.sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, remember_me, device_id)
       VALUES ($1, $2, 'fakehash', now(), now(), now() + interval '1 day', false, $3)`,
      [ulid(), user.props.id, devId],
    )

    await ctx.run(authedStore(user.props.id), () =>
      requestEmailChange.execute({
        currentPassword: PASSWORD,
        newEmail: "NOVO@EXAMPLE.COM",
      }),
    )

    const updated = await usersRepo.findById(user.props.id)
    expect(updated?.props.status).toBe("pending")
    expect(updated?.props.emailVerified).toBe(false)
    expect(updated?.props.pendingEmail).toBe("novo@example.com")
    expect(updated?.props.email).toBe("user@example.com") // e-mail antigo PRESERVADO

    const { rows: tokenRows } = await pool.query<{ type: string }>(
      `SELECT type FROM identity.verification_tokens WHERE user_id = $1 AND type = 'email_change' AND consumed_at IS NULL`,
      [user.props.id],
    )
    expect(tokenRows).toHaveLength(1)

    const { rows: sessRows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.sessions WHERE user_id = $1`,
      [user.props.id],
    )
    expect(Number(sessRows[0]!.count)).toBe(0)

    // outbox: 2 eventos (payload é o envelope; recipientId fica em payload.payload)
    const { rows: outboxRows } = await pool.query<{ event_name: string; notif_type: string }>(
      `SELECT event_name, payload->'payload'->>'type' AS notif_type
       FROM _kernel.outbox
       WHERE payload->'payload'->>'recipientId' = $1
       ORDER BY occurred_at`,
      [user.props.id],
    )
    expect(outboxRows).toHaveLength(2)
    expect(outboxRows.every((r) => r.event_name === "notification.requested")).toBe(true)
    const notifTypes = outboxRows.map((r) => r.notif_type)
    expect(notifTypes).toContain("email_change_requested")
    expect(notifTypes).toContain("email_change_notice")
  })

  it("caso 2: senha incorreta → InvalidCredentialsError, sem alteração de estado", async () => {
    const user = await seedActiveUser(usersRepo, hasher)

    await expect(
      ctx.run(authedStore(user.props.id), () =>
        requestEmailChange.execute({
          currentPassword: "senha-errada",
          newEmail: "novo@example.com",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    const unchanged = await usersRepo.findById(user.props.id)
    expect(unchanged?.props.status).toBe("active")
    expect(unchanged?.props.pendingEmail).toBeNull()
  })

  it("caso 3: novo e-mail igual ao atual → EmailUnchangedError", async () => {
    const user = await seedActiveUser(usersRepo, hasher)

    await expect(
      ctx.run(authedStore(user.props.id), () =>
        requestEmailChange.execute({
          currentPassword: PASSWORD,
          newEmail: "user@example.com",
        }),
      ),
    ).rejects.toBeInstanceOf(EmailUnchangedError)
  })

  it("caso 4: novo e-mail já em uso por outro usuário → EmailAlreadyInUseError", async () => {
    const user = await seedActiveUser(usersRepo, hasher)
    await seedActiveUser(usersRepo, hasher, "outro@example.com")

    await expect(
      ctx.run(authedStore(user.props.id), () =>
        requestEmailChange.execute({
          currentPassword: PASSWORD,
          newEmail: "outro@example.com",
        }),
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError)
  })

  it("caso 4b: recusa persiste o cooldown e a segunda tentativa bate em 429", async () => {
    const user = await seedActiveUser(usersRepo, hasher)
    await seedActiveUser(usersRepo, hasher, "outro@example.com")

    await expect(
      ctx.run(authedStore(user.props.id), () =>
        requestEmailChange.execute({
          currentPassword: PASSWORD,
          newEmail: "outro@example.com",
        }),
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError)

    // o carimbo ficou no banco, sem iniciar troca nenhuma
    const after = await usersRepo.findById(user.props.id)
    expect(after?.props.lastEmailChangeRequestedAt).not.toBeNull()
    expect(after?.props.pendingEmail).toBeNull()
    expect(after?.props.status).toBe("active")

    // sondar outro endereço logo em seguida custa a espera do cooldown
    await expect(
      ctx.run(authedStore(user.props.id), () =>
        requestEmailChange.execute({
          currentPassword: PASSWORD,
          newEmail: "terceiro@example.com",
        }),
      ),
    ).rejects.toBeInstanceOf(RateLimitedError)
  })

  it("caso 5: confirmação com token válido → email promovido, pending_email cleared, sessão criada", async () => {
    const user = await seedActiveUser(usersRepo, hasher)

    let capturedRaw: string | null = null
    const origGenerate = tokenGen.generate.bind(tokenGen)
    jest.spyOn(tokenGen, "generate").mockImplementationOnce(() => {
      const tok = origGenerate()
      capturedRaw = tok.raw
      return tok
    })

    await ctx.run(authedStore(user.props.id), () =>
      requestEmailChange.execute({
        currentPassword: PASSWORD,
        newEmail: "confirmado@example.com",
      }),
    )

    expect(capturedRaw).not.toBeNull()

    // Confirma com o token (ctx anônimo — correlationId obrigatório para auth_event)
    const result = await ctx.run(
      { ...authedStore(user.props.id), actor: null, extensions: new Map() },
      () => confirmEmailChange.execute({ token: capturedRaw! }),
    )

    expect(result.user.email).toBe("confirmado@example.com")
    expect(result.sessionToken).toBeTruthy()

    const confirmed = await usersRepo.findById(user.props.id)
    expect(confirmed?.props.email).toBe("confirmado@example.com")
    expect(confirmed?.props.pendingEmail).toBeNull()
    expect(confirmed?.props.status).toBe("active")
    expect(confirmed?.props.emailVerified).toBe(true)

    const { rows } = await pool.query(
      `SELECT consumed_at FROM identity.verification_tokens WHERE user_id = $1 AND type = 'email_change'`,
      [user.props.id],
    )
    expect(rows.every((r: { consumed_at: unknown }) => r.consumed_at !== null)).toBe(true)
  })

  it("caso 6: token inválido/expirado → InvalidEmailChangeTokenError", async () => {
    await expect(
      ctx.run(authedStore("anon"), () =>
        confirmEmailChange.execute({ token: "token-invalido-xyz" }),
      ),
    ).rejects.toBeInstanceOf(InvalidEmailChangeTokenError)
  })

  it("caso 7: job reverte user com token expirado; user com token ativo não é revertido", async () => {
    const now = new Date()

    const user1 = await seedActiveUser(usersRepo, hasher, "stale@example.com")
    const updatedUser1 = user1.requestEmailChange("novo-stale@example.com", now)
    await usersRepo.update(updatedUser1)
    await verificationTokensRepo.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: user1.props.id,
        tokenHash: tokenGen.hashOf("raw-expirado"),
        type: "email_change",
        expiresAt: new Date(now.getTime() - 1000), // já expirou
        consumedAt: null,
        createdAt: now,
      }),
    )

    const user2 = await seedActiveUser(usersRepo, hasher, "active@example.com")
    const updatedUser2 = user2.requestEmailChange("novo-active@example.com", now)
    await usersRepo.update(updatedUser2)
    await verificationTokensRepo.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: user2.props.id,
        tokenHash: tokenGen.hashOf("raw-ativo"),
        type: "email_change",
        expiresAt: new Date(now.getTime() + 3_600_000), // 1h no futuro
        consumedAt: null,
        createdAt: now,
      }),
    )

    await revertJob.revertExpired()

    const after1 = await usersRepo.findById(user1.props.id)
    expect(after1?.props.status).toBe("active")
    expect(after1?.props.pendingEmail).toBeNull()
    expect(after1?.props.email).toBe("stale@example.com") // e-mail original restaurado

    const after2 = await usersRepo.findById(user2.props.id)
    expect(after2?.props.status).toBe("pending") // ainda pendente
    expect(after2?.props.pendingEmail).toBe("novo-active@example.com")
  })
})

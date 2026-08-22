import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { LoginUseCase } from "../../application/use-cases/login/login.use-case"
import {
  AuthEvent,
  type AuthEventType,
} from "../../domain/entities/auth-event.entity"
import { InvalidCredentialsError } from "../../domain/errors"
import { parseIdentityConfig } from "../../identity.config"
import { authEvents } from "../tables/auth-event.table"

import { DrizzleAuthEventRepository } from "./drizzle-auth-event.repository"

import type { RequestContextStore } from "../../../../shared/kernel/context/request-context"
import type { Pool } from "pg"

describe("DrizzleAuthEventRepository (int)", () => {
  let pool: Pool
  let db: ReturnType<typeof createTestDb>
  let txm: TransactionManager
  let repo: DrizzleAuthEventRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleAuthEventRepository(txm)
  })

  const makeEvent = (id: string, eventType: AuthEventType): AuthEvent =>
    AuthEvent.fromProps({
      id,
      userId: null,
      actorUserId: null,
      eventType,
      emailHash: null,
      ip: null,
      userAgent: null,
      correlationId: "corr",
      traceId: null,
      spanId: null,
      metadata: null,
      createdAt: new Date(),
    })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("record grava um evento de falha (fora da tx)", async () => {
    await repo.record(
      AuthEvent.fromProps({
        id: ulid(),
        userId: null,
        actorUserId: null,
        eventType: "login_failed",
        emailHash: "deadbeef",
        ip: "203.0.113.1",
        userAgent: "jest",
        correlationId: "corr-1",
        traceId: null,
        spanId: null,
        metadata: { reason: "wrong_password" },
        createdAt: new Date(),
      })
    )
    const rows = await db.select().from(authEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventType).toBe("login_failed")
  })

  it("append-only: UPDATE em auth_events lança", async () => {
    const id = ulid()
    await repo.record(
      AuthEvent.fromProps({
        id,
        userId: null,
        actorUserId: null,
        eventType: "login_failed",
        emailHash: null,
        ip: null,
        userAgent: null,
        correlationId: "corr-2",
        traceId: null,
        spanId: null,
        metadata: null,
        createdAt: new Date(),
      })
    )
    await expect(
      pool.query(
        "UPDATE identity.auth_events SET ip = '1.2.3.4' WHERE id = $1",
        [id]
      )
    ).rejects.toThrow()
  })

  it("append-only: DELETE em auth_events lança", async () => {
    const id = ulid()
    await repo.record(
      AuthEvent.fromProps({
        id,
        userId: null,
        actorUserId: null,
        eventType: "login_failed",
        emailHash: null,
        ip: null,
        userAgent: null,
        correlationId: "corr-3",
        traceId: null,
        spanId: null,
        metadata: null,
        createdAt: new Date(),
      })
    )
    await expect(
      pool.query("DELETE FROM identity.auth_events WHERE id = $1", [id])
    ).rejects.toThrow()
  })

  const makeEventAt = (id: string, createdAt: Date): AuthEvent =>
    AuthEvent.fromProps({
      id,
      userId: null,
      actorUserId: null,
      eventType: "login_success",
      emailHash: null,
      ip: null,
      userAgent: null,
      correlationId: "corr",
      traceId: null,
      spanId: null,
      metadata: null,
      createdAt,
    })

  it("deleteOlderThan purga o vencido e mantém o recente (escape hatch em tx)", async () => {
    const oldId = ulid()
    const recentId = ulid()
    await repo.record(makeEventAt(oldId, new Date("2020-01-01T00:00:00Z")))
    await repo.record(makeEventAt(recentId, new Date()))

    const removed = await txm.run(() =>
      repo.deleteOlderThan(new Date("2024-01-01T00:00:00Z"))
    )

    expect(removed).toBe(1)
    const rows = await db.select().from(authEvents)
    expect(rows.map((r) => r.id)).toEqual([recentId])
  })

  it("deleteOlderThan exige tx aberta (GUC é transaction-scoped)", async () => {
    await expect(repo.deleteOlderThan(new Date())).rejects.toThrow(
      /transação aberta/
    )
  })

  it("deleteOlderThan retorna 0 quando nada vencido", async () => {
    const recentId = ulid()
    await repo.record(makeEventAt(recentId, new Date()))

    const removed = await txm.run(() =>
      repo.deleteOlderThan(new Date("2020-01-01T00:00:00Z"))
    )

    expect(removed).toBe(0)
    const rows = await db.select().from(authEvents)
    expect(rows.map((r) => r.id)).toEqual([recentId])
  })

  it("deleteOlderThan preserva evento exatamente no cutoff (corte estrito <)", async () => {
    const cutoff = new Date("2024-01-01T00:00:00Z")
    const atCutoffId = ulid()
    await repo.record(makeEventAt(atCutoffId, cutoff))

    const removed = await txm.run(() => repo.deleteOlderThan(cutoff))

    expect(removed).toBe(0)
    const rows = await db.select().from(authEvents)
    expect(rows.map((r) => r.id)).toEqual([atCutoffId])
  })

  it("recordInTx some quando a tx de negócio dá rollback", async () => {
    await expect(
      txm.run(async () => {
        await repo.recordInTx(makeEvent(ulid(), "login_success"))
        throw new Error("rollback forçado")
      })
    ).rejects.toThrow("rollback forçado")
    expect(await db.select().from(authEvents)).toHaveLength(0)
  })

  it("recordInTx grava exatamente uma linha quando a tx de negócio comita", async () => {
    const id = ulid()
    await txm.run(() => repo.recordInTx(makeEvent(id, "login_success")))
    const rows = await db.select().from(authEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(id)
    expect(rows[0]?.eventType).toBe("login_success")
  })

  it("record lança dentro de uma transação de negócio (pede 2ª conexão)", async () => {
    const id = ulid()
    await expect(
      txm.run(() => repo.record(makeEvent(id, "login_failed")))
    ).rejects.toThrow(/transação ativa/)
    expect(await db.select().from(authEvents)).toHaveLength(0)
  })

  it("recordInTx lança fora de uma transação", async () => {
    await expect(
      repo.recordInTx(makeEvent(ulid(), "login_success"))
    ).rejects.toThrow(/transação aberta/)
    expect(await db.select().from(authEvents)).toHaveLength(0)
  })

  describe("listByUser", () => {
    // Helper local: difere do makeEvent externo — recebe userId e createdAt explícitos.
    function makeUserEvent(
      userId: string,
      eventType: AuthEventType,
      createdAt: Date
    ): AuthEvent {
      return AuthEvent.fromProps({
        id: ulid(),
        userId,
        actorUserId: null,
        eventType,
        emailHash: null,
        ip: "10.0.0.1",
        userAgent: "jest",
        correlationId: ulid(),
        traceId: null,
        spanId: null,
        metadata: null,
        createdAt,
      })
    }

    it("filtra pela allowlist, ordena desc por created_at e pagina", async () => {
      const userId = ulid()
      await repo.record(
        makeUserEvent(userId, "login_success", new Date("2026-01-01T10:00:00Z"))
      )
      await repo.record(
        makeUserEvent(userId, "logout", new Date("2026-01-01T11:00:00Z"))
      )
      await repo.record(
        makeUserEvent(
          userId,
          "password_changed",
          new Date("2026-01-01T12:00:00Z")
        )
      )
      await repo.record(
        makeUserEvent(userId, "admin_action", new Date("2026-01-01T13:00:00Z"))
      ) // fora da allowlist

      const allowlist = ["login_success", "logout", "password_changed"] as const
      const page1 = await repo.listByUser(
        userId,
        { page: 1, pageSize: 2, order: "desc" },
        allowlist
      )

      expect(page1.page.total).toBe(3)
      expect(page1.page.totalPages).toBe(2)
      expect(page1.data.map((e) => e.props.eventType)).toEqual([
        "password_changed",
        "logout",
      ])

      const page2 = await repo.listByUser(
        userId,
        { page: 2, pageSize: 2, order: "desc" },
        allowlist
      )
      expect(page2.data.map((e) => e.props.eventType)).toEqual([
        "login_success",
      ])
    })

    it("allowlist vazia retorna página vazia", async () => {
      const userId = ulid()
      await repo.record(makeUserEvent(userId, "login_success", new Date()))
      const res = await repo.listByUser(userId, { page: 1, pageSize: 10 }, [])
      expect(res.data).toEqual([])
      expect(res.page.total).toBe(0)
    })

    it("escopa por user (não vaza eventos de outro dono)", async () => {
      const a = ulid()
      const b = ulid()
      await repo.record(makeUserEvent(a, "login_success", new Date()))
      await repo.record(makeUserEvent(b, "login_success", new Date()))
      const res = await repo.listByUser(a, { page: 1, pageSize: 10 }, [
        "login_success",
      ])
      expect(res.page.total).toBe(1)
    })
  })

  describe("LoginUseCase através do repositório real (caminhos de falha)", () => {
    let ctx: RequestContext

    beforeAll(() => {
      ctx = new RequestContext()
    })

    function guestStore(): RequestContextStore {
      return {
        requestId: "req-login",
        correlationId: "corr-login",
        causationId: null,
        traceId: null,
        spanId: null,
        tenantId: null,
        origin: "http",
        actor: null,
        extensions: new Map(),
        locale: "pt-BR",
        ip: "203.0.113.9",
        userAgent: "jest",
        startedAt: 0,
      }
    }

    function makeLoginUseCase(
      rateLimiterAllowed: boolean,
      hasherVerifyResult: boolean
    ): LoginUseCase {
      const users = {
        findByEmail: vi.fn().mockResolvedValue(null),
        findByIdForUpdate: vi.fn(),
        update: vi.fn(),
        findPermissions: vi.fn(),
      }
      const hasher = {
        verify: vi.fn().mockResolvedValue(hasherVerifyResult),
        needsRehash: vi.fn().mockReturnValue(false),
        hash: vi.fn().mockResolvedValue("argon2-dummy"),
      }
      const tokens = {
        generate: vi.fn(),
        hashOf: vi.fn().mockReturnValue("email-hash"),
      }
      const rateLimiter = {
        consume: vi.fn().mockResolvedValue({
          allowed: rateLimiterAllowed,
          retryAfterSeconds: 30,
        }),
        reset: vi.fn().mockResolvedValue(undefined),
      }
      const clock = { now: () => new Date("2026-05-30T00:00:00.000Z") }
      const outbox = { publish: vi.fn() }
      const config = parseIdentityConfig({
        WEB_ORIGIN: "http://localhost:5173",
        PASSWORD_PEPPER: "x".repeat(32),
        CSRF_SECRET: "y".repeat(32),
        BREACH_CHECK_MODE: "fail_closed",
        BREACH_CHECK_ENABLED: "false",
        COOKIE_SECURE: "false",
        COOKIE_NAME: "rit_session",
        DEVICE_COOKIE_NAME: "rit_device",
      })
      return new LoginUseCase(
        users as never,
        hasher,
        tokens as never,
        rateLimiter,
        repo,
        clock,
        ctx,
        config,
        outbox as never,
        {} as never
      )
    }

    it("rate-limit estourado (login.use-case.ts:82) grava rate_limited_burst fora da tx", async () => {
      const uc = makeLoginUseCase(false, true)
      await uc.onModuleInit()
      await expect(
        ctx.run(guestStore(), () =>
          uc.execute({
            email: "burst@example.com",
            password: "x",
            rememberMe: false,
          })
        )
      ).rejects.toBeInstanceOf(InvalidCredentialsError)

      const rows = await db.select().from(authEvents)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.eventType).toBe("rate_limited_burst")
    })

    it("senha incorreta (login.use-case.ts:124) grava login_failed fora da tx", async () => {
      const uc = makeLoginUseCase(true, false)
      await uc.onModuleInit()
      await expect(
        ctx.run(guestStore(), () =>
          uc.execute({
            email: "ghost@example.com",
            password: "wrong",
            rememberMe: false,
          })
        )
      ).rejects.toBeInstanceOf(InvalidCredentialsError)

      const rows = await db.select().from(authEvents)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.eventType).toBe("login_failed")
    })
  })
})

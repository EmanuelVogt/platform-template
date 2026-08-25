import { describe, expect, it, vi } from "vitest"

import { User, type UserProps } from "../../domain/entities/user.entity"
import { makeIdentityConfig } from "../../testing/identity.config.fixture"
import { fakeRequestContext } from "../request-context.fixture"

import { CreateSessionService } from "./create-session.service"

const NOW = new Date("2026-05-30T00:00:00.000Z")
const MAX_SESSIONS = 3

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
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: null,
    avatarAttachmentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    createdByUserId: null,
    ...over,
  })
}

function makeDeps(over: { sessionCount?: number } = {}) {
  const sessions = {
    create: vi.fn().mockResolvedValue(undefined),
    countByUser: vi.fn().mockResolvedValue(over.sessionCount ?? 1),
    deleteOldestOverCap: vi.fn().mockResolvedValue(undefined),
    deleteByDevice: vi.fn().mockResolvedValue(undefined),
  }
  const devices = {
    findByUserAndCookieHash: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
  }
  const tokens = {
    generate: vi.fn().mockReturnValue({ raw: "raw-sess", hash: "hash-sess" }),
    hashOf: vi.fn().mockReturnValue("cookie-hash"),
  }
  const ctx = fakeRequestContext(() => ({
    ip: "1.2.3.4",
    userAgent: "jest",
    correlationId: "c1",
    locale: "pt-BR",
    userId: null,
    sessionId: null,
  }))
  const config = makeIdentityConfig({ SESSION_MAX_PER_USER: MAX_SESSIONS })
  const service = new CreateSessionService(
    sessions as never,
    devices as never,
    tokens as never,
    config,
    ctx
  )
  return { service, sessions }
}

describe("CreateSessionService", () => {
  describe("cap de sessões por usuário", () => {
    it("acima do teto: revoga as mais antigas além do cap", async () => {
      const t = makeDeps({ sessionCount: MAX_SESSIONS + 1 })
      await t.service.create(makeUser(), { rememberMe: false }, NOW)
      expect(t.sessions.deleteOldestOverCap).toHaveBeenCalledWith(
        "u-1",
        MAX_SESSIONS
      )
    })

    it("revoga só DEPOIS de criar a sessão nova (a recém-criada conta pro teto)", async () => {
      const t = makeDeps({ sessionCount: MAX_SESSIONS + 1 })
      await t.service.create(makeUser(), { rememberMe: false }, NOW)
      expect(t.sessions.create.mock.invocationCallOrder[0]).toBeLessThan(
        t.sessions.deleteOldestOverCap.mock.invocationCallOrder[0] ?? 0
      )
    })

    it("no teto exato: não revoga nada", async () => {
      const t = makeDeps({ sessionCount: MAX_SESSIONS })
      await t.service.create(makeUser(), { rememberMe: false }, NOW)
      expect(t.sessions.deleteOldestOverCap).not.toHaveBeenCalled()
    })
  })
})

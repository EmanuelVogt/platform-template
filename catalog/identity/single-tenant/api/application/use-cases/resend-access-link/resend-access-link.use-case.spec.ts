import { AccessLinkNotResendableError } from "../../../domain/errors"
import { makeIdentityConfig } from "../../../identity.config.fixture"
import { fakeRequestContext } from "../../request-context.fixture"

import { ResendAccessLinkUseCase } from "./resend-access-link.use-case"

const NOW = new Date("2026-06-08T00:00:00.000Z")
const PENDING = { props: { id: "u-1", name: "Ana", email: "ana@x.test", status: "pending", accessProfile: "admin" } }

function makeDeps(over: Record<string, any> = {}) {
  const users = over.users ?? { findById: jest.fn().mockResolvedValue(PENDING) }
  const verificationTokens = over.verificationTokens ?? {
    findLatestForUser: jest.fn().mockResolvedValue({ expiresAt: new Date("2026-06-01T00:00:00.000Z"), consumedAt: null }), // expirado
    invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  }
  const tokens = over.tokens ?? { generate: jest.fn().mockReturnValue({ raw: "raw-tok", hash: "hash-tok" }) }
  const outbox = over.outbox ?? { publish: jest.fn().mockResolvedValue(undefined) }
  const authEvents = over.authEvents ?? { recordInTx: jest.fn().mockResolvedValue(undefined) }
  const clock = over.clock ?? { now: () => NOW }
  const ctx = over.ctx ?? fakeRequestContext(() => ({ ip: null, userAgent: null, correlationId: "c1", locale: "pt-BR", userId: "master-1", sessionId: null, traceId: null, spanId: null }))
  const config = over.config ?? makeIdentityConfig()
  const uc = new ResendAccessLinkUseCase(users, verificationTokens, tokens, outbox, authEvents, clock, ctx, config)
  return { uc, users, verificationTokens, tokens, outbox, authEvents }
}

describe("ResendAccessLinkUseCase", () => {
  it("usuário inexistente lança AccessLinkNotResendableError", async () => {
    const t = makeDeps({ users: { findById: jest.fn().mockResolvedValue(null) } })
    await expect(t.uc.execute({ userId: "x" })).rejects.toBeInstanceOf(AccessLinkNotResendableError)
  })

  it("usuário não-pending lança AccessLinkNotResendableError", async () => {
    const t = makeDeps({ users: { findById: jest.fn().mockResolvedValue({ props: { ...PENDING.props, status: "active" } }) } })
    await expect(t.uc.execute({ userId: "u-1" })).rejects.toBeInstanceOf(AccessLinkNotResendableError)
  })

  it("link de acesso ainda válido lança AccessLinkNotResendableError", async () => {
    const t = makeDeps({
      verificationTokens: {
        findLatestForUser: jest.fn().mockResolvedValue({ expiresAt: new Date("2026-07-01T00:00:00.000Z"), consumedAt: null }),
        invalidateAllForUser: jest.fn(), create: jest.fn(),
      },
    })
    await expect(t.uc.execute({ userId: "u-1" })).rejects.toBeInstanceOf(AccessLinkNotResendableError)
    expect(t.outbox.publish).not.toHaveBeenCalled()
  })

  it("pending + expirado: rotaciona token, publica SendAccessLink e audita access_link_resent", async () => {
    const t = makeDeps()
    await t.uc.execute({ userId: "u-1" })
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith("u-1", "access_link")
    expect(t.verificationTokens.create).toHaveBeenCalledTimes(1)
    expect(t.outbox.publish).toHaveBeenCalled()
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ eventType: "access_link_resent" }) }),
    )
  })

  it("pending sem token (null) é reenviável", async () => {
    const t = makeDeps({
      verificationTokens: {
        findLatestForUser: jest.fn().mockResolvedValue(null),
        invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(undefined),
      },
    })
    await t.uc.execute({ userId: "u-1" })
    expect(t.outbox.publish).toHaveBeenCalled()
  })

  it("token consumido (consumedAt != null) mas não expirado é reenviável", async () => {
    const t = makeDeps({
      verificationTokens: {
        findLatestForUser: jest.fn().mockResolvedValue({
          expiresAt: new Date("2026-07-01T00:00:00.000Z"),
          consumedAt: new Date("2026-06-07T00:00:00.000Z"),
        }),
        invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(undefined),
      },
    })
    await t.uc.execute({ userId: "u-1" })
    expect(t.verificationTokens.invalidateAllForUser).toHaveBeenCalledWith("u-1", "access_link")
    expect(t.outbox.publish).toHaveBeenCalled()
  })

  it("token expirado exato na fronteira (expiresAt === now) é reenviável", async () => {
    const t = makeDeps({
      verificationTokens: {
        findLatestForUser: jest.fn().mockResolvedValue({
          expiresAt: NOW,
          consumedAt: null,
        }),
        invalidateAllForUser: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(undefined),
      },
    })
    await t.uc.execute({ userId: "u-1" })
    expect(t.outbox.publish).toHaveBeenCalled()
  })

  it("usuário inexistente não chama invalidateAllForUser nem create", async () => {
    const t = makeDeps({ users: { findById: jest.fn().mockResolvedValue(null) } })
    await expect(t.uc.execute({ userId: "x" })).rejects.toBeInstanceOf(AccessLinkNotResendableError)
    expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
    expect(t.verificationTokens.create).not.toHaveBeenCalled()
  })

  it("usuário não-pending não chama invalidateAllForUser nem create", async () => {
    const t = makeDeps({
      users: { findById: jest.fn().mockResolvedValue({ props: { ...PENDING.props, status: "active" } }) },
    })
    await expect(t.uc.execute({ userId: "u-1" })).rejects.toBeInstanceOf(AccessLinkNotResendableError)
    expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
    expect(t.verificationTokens.create).not.toHaveBeenCalled()
  })

  it("link de acesso ainda válido não chama invalidateAllForUser nem create", async () => {
    const t = makeDeps({
      verificationTokens: {
        findLatestForUser: jest.fn().mockResolvedValue({
          expiresAt: new Date("2026-07-01T00:00:00.000Z"),
          consumedAt: null,
        }),
        invalidateAllForUser: jest.fn(),
        create: jest.fn(),
      },
    })
    await expect(t.uc.execute({ userId: "u-1" })).rejects.toBeInstanceOf(AccessLinkNotResendableError)
    expect(t.verificationTokens.invalidateAllForUser).not.toHaveBeenCalled()
    expect(t.verificationTokens.create).not.toHaveBeenCalled()
  })

  it("payload da notificação contém link com WEB_ORIGIN, email, name, locale e tokenExpiresAt", async () => {
    const config = makeIdentityConfig({ WEB_ORIGIN: "https://app.test" })
    const t = makeDeps({ config })
    await t.uc.execute({ userId: "u-1" })
    const published: { payload: { type: string; recipientId: string; locale: string; data: Record<string, unknown> } } =
      t.outbox.publish.mock.calls[0][0]
    expect(published.payload.type).toBe("access_link_sent")
    expect(published.payload.recipientId).toBe("u-1")
    expect(published.payload.data.link).toContain("https://app.test/configurar-senha?token=raw-tok")
    expect(published.payload.data.email).toBe(PENDING.props.email)
    expect(published.payload.data.name).toBe(PENDING.props.name)
    expect(published.payload.locale).toBe("pt-BR")
    expect(typeof published.payload.data.tokenExpiresAt).toBe("string")
  })

  it("authEvent gravado com userId do alvo e actorUserId do contexto", async () => {
    const t = makeDeps()
    await t.uc.execute({ userId: "u-1" })
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          eventType: "access_link_resent",
          userId: "u-1",
          actorUserId: "master-1",
        }),
      }),
    )
  })
})

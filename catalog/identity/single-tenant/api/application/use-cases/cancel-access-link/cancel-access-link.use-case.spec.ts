import { describe, expect, it, vi } from "vitest"

import { InvalidAccessLinkError } from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { CancelAccessLinkUseCase } from "./cancel-access-link.use-case"

const NOW = new Date("2026-06-08T00:00:00.000Z")

function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    consumeByHash: vi.fn().mockResolvedValue({ userId: "u-1" }),
  }
  const tokens = over.tokens ?? {
    hashOf: vi.fn().mockReturnValue("hash-of-raw"),
  }
  const authEvents = over.authEvents ?? {
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
      traceId: null,
      spanId: null,
    }))
  const uc = new CancelAccessLinkUseCase(
    verificationTokens,
    tokens,
    authEvents,
    clock,
    ctx
  )
  return { uc, verificationTokens, tokens, authEvents }
}

describe("CancelAccessLinkUseCase", () => {
  it("happy: consome o token e registra access_link_cancelled", async () => {
    const t = makeDeps()
    await t.uc.execute({ token: "raw" })
    expect(t.tokens.hashOf).toHaveBeenCalledWith("raw")
    expect(t.verificationTokens.consumeByHash).toHaveBeenCalledWith(
      "hash-of-raw",
      "access_link",
      NOW
    )
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          eventType: "access_link_cancelled",
          userId: "u-1",
        }),
      })
    )
  })

  it("token inválido (consumeByHash null) lança InvalidAccessLinkError sem gravar evento", async () => {
    const t = makeDeps({
      verificationTokens: { consumeByHash: vi.fn().mockResolvedValue(null) },
    })
    await expect(t.uc.execute({ token: "raw" })).rejects.toBeInstanceOf(
      InvalidAccessLinkError
    )
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("token inválido (consumeByHash undefined) lança InvalidAccessLinkError sem gravar evento", async () => {
    const t = makeDeps({
      verificationTokens: {
        consumeByHash: vi.fn().mockResolvedValue(undefined),
      },
    })
    await expect(t.uc.execute({ token: "raw" })).rejects.toBeInstanceOf(
      InvalidAccessLinkError
    )
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("passa o hash do token e o propósito correto para consumeByHash", async () => {
    const consumeByHash = vi.fn().mockResolvedValue({ userId: "u-2" })
    const hashOf = vi.fn().mockReturnValue("hashed-token")
    const t = makeDeps({
      verificationTokens: { consumeByHash },
      tokens: { hashOf },
    })
    await t.uc.execute({ token: "my-raw-token" })
    expect(hashOf).toHaveBeenCalledWith("my-raw-token")
    expect(consumeByHash).toHaveBeenCalledWith(
      "hashed-token",
      "access_link",
      NOW
    )
  })

  it("registra evento com userId do token consumido", async () => {
    const t = makeDeps({
      verificationTokens: {
        consumeByHash: vi.fn().mockResolvedValue({ userId: "u-specific" }),
      },
    })
    await t.uc.execute({ token: "raw" })
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          eventType: "access_link_cancelled",
          userId: "u-specific",
        }),
      })
    )
  })
})

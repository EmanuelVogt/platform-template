import { describe, expect, it, vi } from "vitest"

import { InvalidAccessLinkError } from "../../../domain/errors"

import { ValidateAccessLinkQuery } from "./validate-access-link.use-case"

const NOW = new Date("2026-06-08T00:00:00.000Z")

function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    findActiveByHash: vi.fn().mockResolvedValue({ userId: "u-1", expiresAt: new Date("2026-07-01T00:00:00.000Z") }),
  }
  const users = over.users ?? {
    findById: vi.fn().mockResolvedValue({ props: { id: "u-1", name: "Ana", email: "ana@x.test", status: "pending", avatarAttachmentId: null } }),
  }
  const tokens = over.tokens ?? { hashOf: vi.fn().mockReturnValue("hash-of-raw") }
  const clock = over.clock ?? { now: () => NOW }
  const uc = new ValidateAccessLinkQuery(verificationTokens, users, tokens, clock)
  return { uc, verificationTokens, users, tokens }
}

describe("ValidateAccessLinkQuery", () => {
  it("token válido + pending retorna { name, email } e NÃO consome", async () => {
    const t = makeDeps()
    const info = await t.uc.execute({ token: "raw" })
    expect(info).toEqual({ name: "Ana", email: "ana@x.test", avatarAttachmentId: null })
    expect(t.tokens.hashOf).toHaveBeenCalledWith("raw")
  })

  it("token inválido/expirado lança InvalidAccessLinkError", async () => {
    const t = makeDeps({ verificationTokens: { findActiveByHash: vi.fn().mockResolvedValue(null) } })
    await expect(t.uc.execute({ token: "raw" })).rejects.toBeInstanceOf(InvalidAccessLinkError)
  })

  it("usuário não-pending lança InvalidAccessLinkError", async () => {
    const t = makeDeps({ users: { findById: vi.fn().mockResolvedValue({ props: { status: "active" } }) } })
    await expect(t.uc.execute({ token: "raw" })).rejects.toBeInstanceOf(InvalidAccessLinkError)
  })

  it("usuário não encontrado (findById retorna null) lança InvalidAccessLinkError", async () => {
    const t = makeDeps({ users: { findById: vi.fn().mockResolvedValue(null) } })
    await expect(t.uc.execute({ token: "raw" })).rejects.toBeInstanceOf(InvalidAccessLinkError)
  })
})

import { describe, expect, it } from "vitest"

import { VerificationToken } from "./verification-token.entity"

const NOW = new Date("2026-04-01T00:00:00Z")

function buildToken(
  overrides: Partial<Parameters<typeof VerificationToken.create>[0]> = {}
) {
  return VerificationToken.create({
    userId: "user-1",
    tokenHash: "hash",
    type: "password_reset",
    expiresAt: new Date(NOW.getTime() + 3600 * 1000),
    ...overrides,
  })
}

describe("VerificationToken.create", () => {
  it("gera id ULID, consumedAt=null, createdAt e preserva type", () => {
    const token = buildToken({ type: "email_verify" })
    expect(token.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(token.props.consumedAt).toBeNull()
    expect(token.props.type).toBe("email_verify")
    expect(token.props.createdAt).toBeInstanceOf(Date)
  })
})

describe("VerificationToken.isValid (clock injetado)", () => {
  it("true quando não consumido e não expirado", () => {
    expect(buildToken().isValid(NOW)).toBe(true)
  })

  it("false quando já consumido", () => {
    const token = VerificationToken.fromProps({
      ...buildToken().props,
      consumedAt: new Date("2026-04-01T00:30:00Z"),
    })
    expect(token.isValid(NOW)).toBe(false)
  })

  it("false quando expirado", () => {
    const token = VerificationToken.fromProps({
      ...buildToken().props,
      expiresAt: new Date("2026-03-31T23:59:59Z"),
    })
    expect(token.isValid(NOW)).toBe(false)
  })

  it("borda: expiresAt == now é inválido (> estrito)", () => {
    const token = VerificationToken.fromProps({
      ...buildToken().props,
      expiresAt: new Date(NOW),
    })
    expect(token.isValid(NOW)).toBe(false)
  })

  it("false quando consumido e também expirado (ambas condições falsas)", () => {
    const token = VerificationToken.fromProps({
      ...buildToken().props,
      consumedAt: new Date("2026-03-31T12:00:00Z"),
      expiresAt: new Date("2026-03-31T23:59:59Z"),
    })
    expect(token.isValid(NOW)).toBe(false)
  })
})

describe("VerificationToken — imutabilidade em runtime", () => {
  it("props é congelado: escrita direta lança", () => {
    const token = buildToken()
    expect(() => {
      ;(token.props as { consumedAt: Date | null }).consumedAt = new Date()
    }).toThrow()
  })
})

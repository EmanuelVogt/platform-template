import { describe, expect, it } from "vitest"

import { Session } from "./session.entity"

const DAY = 86_400 // segundos
const IDLE = 7 * DAY // 7d
const ABSOLUTE = 30 * DAY // 30d
const NOW = new Date("2026-03-01T00:00:00Z")

function at(secondsAgo: number): Date {
  return new Date(NOW.getTime() - secondsAgo * 1000)
}

function buildSession(
  createdSecondsAgo: number,
  lastSeenSecondsAgo: number
): Session {
  return Session.create({
    userId: "user-1",
    tokenHash: "hash",
    expiresAt: new Date(NOW.getTime() + ABSOLUTE * 1000),
    rememberMe: false,
    ipAddress: "127.0.0.1",
    userAgent: "jest",
    deviceId: null,
    createdAt: at(createdSecondsAgo),
    lastSeenAt: at(lastSeenSecondsAgo),
  })
}

describe("Session.create", () => {
  it("gera id ULID e preserva campos", () => {
    const session = Session.create({
      userId: "user-1",
      tokenHash: "hash",
      expiresAt: NOW,
      rememberMe: true,
      ipAddress: null,
      userAgent: null,
      deviceId: "dev-1",
    })
    expect(session.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(session.props.userId).toBe("user-1")
    expect(session.props.rememberMe).toBe(true)
    expect(session.props.deviceId).toBe("dev-1")
    expect(session.props.createdAt).toBeInstanceOf(Date)
    expect(session.props.lastSeenAt).toBeInstanceOf(Date)
  })
})

describe("Session.isExpired — tabela-verdade §6 (idle=7d, absolute=30d)", () => {
  const cases: [string, number, number, boolean][] = [
    // [descrição, createdSecondsAgo, lastSeenSecondsAgo, esperado]
    ["recente: 1d/1d → false", 1 * DAY, 1 * DAY, false],
    ["ativo dentro de ambos: 10d/1d → false", 10 * DAY, 1 * DAY, false],
    ["idle estourado: 10d/8d → true", 10 * DAY, 8 * DAY, true],
    ["absolute estourado: 31d/1d → true", 31 * DAY, 1 * DAY, true],
    ["borda idle exata: 7d/7d → false (== não conta)", 7 * DAY, 7 * DAY, false],
    [
      "borda absolute exata: 30d created, lastSeen 1h → false",
      30 * DAY,
      3600,
      false,
    ],
  ]

  it.each(cases)("%s", (_desc, created, lastSeen, expected) => {
    const session = buildSession(created, lastSeen)
    expect(session.isExpired(NOW, IDLE, ABSOLUTE)).toBe(expected)
  })
})

describe("Session.isExpired — bordas ±ε", () => {
  it("idle + 1s → true", () => {
    const session = buildSession(10 * DAY, IDLE + 1)
    expect(session.isExpired(NOW, IDLE, ABSOLUTE)).toBe(true)
  })

  it("idle - 1s → false", () => {
    const session = buildSession(10 * DAY, IDLE - 1)
    expect(session.isExpired(NOW, IDLE, ABSOLUTE)).toBe(false)
  })

  it("absolute + 1s → true", () => {
    const session = buildSession(ABSOLUTE + 1, 1 * DAY)
    expect(session.isExpired(NOW, IDLE, ABSOLUTE)).toBe(true)
  })

  it("absolute - 1s → false", () => {
    const session = buildSession(ABSOLUTE - 1, 1 * DAY)
    expect(session.isExpired(NOW, IDLE, ABSOLUTE)).toBe(false)
  })
})

describe("Session — imutabilidade em runtime", () => {
  it("props é congelado: escrita direta lança", () => {
    const session = buildSession(1 * DAY, 1 * DAY)
    expect(() => {
      ;(session.props as { expiresAt: Date }).expiresAt = new Date(0)
    }).toThrow()
  })
})

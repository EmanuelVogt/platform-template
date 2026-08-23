import { describe, expect, it } from "vitest"

import { loadIdentityConfig, parseIdentityConfig } from "./identity.config"

const BASE = {
  WEB_ORIGIN: "http://localhost:5173",
  PASSWORD_PEPPER: "x".repeat(32),
  CSRF_SECRET: "y".repeat(32),
  BREACH_CHECK_MODE: "fail_open",
} as NodeJS.ProcessEnv

describe("parseIdentityConfig", () => {
  it("aplica defaults seguros de argon2", () => {
    const c = parseIdentityConfig(BASE)
    expect(c.ARGON_MEMORY_KIB).toBe(65536)
    expect(c.ARGON_TIME_COST).toBe(3)
    expect(c.ARGON_PARALLELISM).toBe(1)
  })

  it("rejeita ARGON_MEMORY_KIB abaixo do floor OWASP (19456)", () => {
    expect(() => parseIdentityConfig({ ...BASE, ARGON_MEMORY_KIB: "4096" })).toThrow()
  })

  it("rejeita PASSWORD_PEPPER curto", () => {
    expect(() => parseIdentityConfig({ ...BASE, PASSWORD_PEPPER: "curto" })).toThrow()
  })

  it("exige WEB_ORIGIN (link de e-mail / CSRF)", () => {
    const { WEB_ORIGIN: _omit, ...semOrigin } = BASE
    expect(() => parseIdentityConfig(semOrigin)).toThrow(/WEB_ORIGIN/)
  })

  it("exige BREACH_CHECK_MODE explícito (sem default)", () => {
    const { BREACH_CHECK_MODE: _omit, ...semBreach } = BASE
    expect(() => parseIdentityConfig(semBreach)).toThrow()
  })

  it("rejeita SESSION_TOUCH_INTERVAL >= SESSION_IDLE_TTL", () => {
    expect(() =>
      parseIdentityConfig({
        ...BASE,
        SESSION_TOUCH_INTERVAL_SECONDS: "999999",
        SESSION_IDLE_TTL_SECONDS: "60",
      }),
    ).toThrow()
  })

  it("rejeita COOKIE_SAMESITE=none sem CSRF_SECRET", () => {
    const { CSRF_SECRET: _omit, ...semCsrf } = BASE
    expect(() => parseIdentityConfig({ ...semCsrf, COOKIE_SAMESITE: "none" })).toThrow()
  })

  it("coage REQUIRE_EMAIL_VERIFICATION de string para boolean", () => {
    expect(parseIdentityConfig(BASE).REQUIRE_EMAIL_VERIFICATION).toBe(false)
    expect(
      parseIdentityConfig({ ...BASE, REQUIRE_EMAIL_VERIFICATION: "true" })
        .REQUIRE_EMAIL_VERIFICATION,
    ).toBe(true)
  })

  it("rejeita COOKIE_NAME __Host- com COOKIE_SECURE=false", () => {
    expect(() => parseIdentityConfig({ ...BASE, COOKIE_SECURE: "false" })).toThrow(
      /COOKIE_SECURE/,
    )
  })

  it("aceita COOKIE_SECURE=false com COOKIE_NAME/DEVICE_COOKIE_NAME sem prefixo", () => {
    const c = parseIdentityConfig({
      ...BASE,
      COOKIE_SECURE: "false",
      COOKIE_NAME: "rit_session",
      DEVICE_COOKIE_NAME: "rit_device",
    })
    expect(c.COOKIE_SECURE).toBe(false)
  })

  it("rejeita DEVICE_COOKIE_NAME __Host- com COOKIE_SECURE=false", () => {
    expect(() =>
      parseIdentityConfig({
        ...BASE,
        COOKIE_SECURE: "false",
        COOKIE_NAME: "rit_session",
      }),
    ).toThrow(/COOKIE_SECURE/)
  })

  it("BREACH_CHECK_ENABLED coage 'true'/'false'; default false", () => {
    expect(parseIdentityConfig(BASE).BREACH_CHECK_ENABLED).toBe(false)
    expect(
      parseIdentityConfig({ ...BASE, BREACH_CHECK_ENABLED: "true" })
        .BREACH_CHECK_ENABLED,
    ).toBe(true)
  })
})

describe("loadIdentityConfig", () => {
  it("lê de process.env e memoiza (mesma instância singleton)", () => {
    const a = loadIdentityConfig()
    const b = loadIdentityConfig()
    expect(a).toBe(b)
    expect(a.WEB_ORIGIN).toBe(process.env.WEB_ORIGIN)
  })

  it("memoização é imune a mutação posterior de process.env", () => {
    const a = loadIdentityConfig()
    const original = process.env.WEB_ORIGIN
    process.env.WEB_ORIGIN = "http://changed.example"
    expect(loadIdentityConfig().WEB_ORIGIN).toBe(a.WEB_ORIGIN)
    process.env.WEB_ORIGIN = original
  })

  it("fail-fast: parseIdentityConfig (base do load) lança em env inválido", () => {
    const { PASSWORD_PEPPER: _omit, ...semPepper } = process.env
    expect(() => parseIdentityConfig(semPepper)).toThrow()
  })
})

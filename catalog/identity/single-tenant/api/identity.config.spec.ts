import { describe, expect, it } from "vitest"

import { loadIdentityConfig, parseIdentityConfig } from "./identity.config"

const BASE = {
  WEB_ORIGIN: "http://localhost:5173",
  PASSWORD_PEPPER: "x".repeat(32),
  CSRF_SECRET: "y".repeat(32),
  BREACH_CHECK_MODE: "fail_open",
  BREACH_CHECK_ENABLED: "false",
} as NodeJS.ProcessEnv

describe("parseIdentityConfig", () => {
  it("aplica defaults seguros de argon2", () => {
    const c = parseIdentityConfig(BASE)
    expect(c.ARGON_MEMORY_KIB).toBe(65536)
    expect(c.ARGON_TIME_COST).toBe(3)
    expect(c.ARGON_PARALLELISM).toBe(1)
  })

  it("rejeita ARGON_MEMORY_KIB abaixo do floor OWASP (19456)", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, ARGON_MEMORY_KIB: "4096" })
    ).toThrow()
  })

  it("rejeita PASSWORD_PEPPER curto", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, PASSWORD_PEPPER: "curto" })
    ).toThrow()
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
      })
    ).toThrow()
  })

  it("rejeita COOKIE_SAMESITE=none sem CSRF_SECRET", () => {
    const { CSRF_SECRET: _omit, ...semCsrf } = BASE
    expect(() =>
      parseIdentityConfig({ ...semCsrf, COOKIE_SAMESITE: "none" })
    ).toThrow()
  })

  it("coage REQUIRE_EMAIL_VERIFICATION de string para boolean", () => {
    expect(parseIdentityConfig(BASE).REQUIRE_EMAIL_VERIFICATION).toBe(false)
    expect(
      parseIdentityConfig({ ...BASE, REQUIRE_EMAIL_VERIFICATION: "true" })
        .REQUIRE_EMAIL_VERIFICATION
    ).toBe(true)
  })

  it("rejeita COOKIE_NAME __Host- com COOKIE_SECURE=false", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, COOKIE_SECURE: "false" })
    ).toThrow(/COOKIE_SECURE/)
  })

  it("aceita COOKIE_SECURE=false com COOKIE_NAME/DEVICE_COOKIE_NAME sem prefixo", () => {
    const c = parseIdentityConfig({
      ...BASE,
      COOKIE_SECURE: "false",
      COOKIE_NAME: "app_session",
      DEVICE_COOKIE_NAME: "app_device",
    })
    expect(c.COOKIE_SECURE).toBe(false)
  })

  it("rejeita DEVICE_COOKIE_NAME __Host- com COOKIE_SECURE=false", () => {
    expect(() =>
      parseIdentityConfig({
        ...BASE,
        COOKIE_SECURE: "false",
        COOKIE_NAME: "app_session",
      })
    ).toThrow(/COOKIE_SECURE/)
  })

  it("BREACH_CHECK_ENABLED coage 'true'/'false' (sem default)", () => {
    expect(parseIdentityConfig(BASE).BREACH_CHECK_ENABLED).toBe(false)
    expect(
      parseIdentityConfig({ ...BASE, BREACH_CHECK_ENABLED: "true" })
        .BREACH_CHECK_ENABLED
    ).toBe(true)
  })

  it("exige BREACH_CHECK_ENABLED: ausente falha nomeando a variável", () => {
    const { BREACH_CHECK_ENABLED: _omit, ...semEnabled } = BASE
    expect(() => parseIdentityConfig(semEnabled)).toThrow(
      /BREACH_CHECK_ENABLED/
    )
  })

  it("rejeita BREACH_CHECK_ENABLED com valor fora do literal", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, BREACH_CHECK_ENABLED: "sim" })
    ).toThrow(/BREACH_CHECK_ENABLED/)
  })

  it("aplica os defaults dos limites de login e de hashing", () => {
    const c = parseIdentityConfig(BASE)
    expect(c.LOGIN_ACCOUNT_MAX_FAILURES).toBe(10)
    expect(c.LOGIN_ACCOUNT_WINDOW_SECONDS).toBe(900)
    expect(c.PASSWORD_HASH_MAX_IN_FLIGHT).toBe(8)
  })

  it("coage os três limites novos de string para número", () => {
    const c = parseIdentityConfig({
      ...BASE,
      LOGIN_ACCOUNT_MAX_FAILURES: "3",
      LOGIN_ACCOUNT_WINDOW_SECONDS: "60",
      PASSWORD_HASH_MAX_IN_FLIGHT: "2",
    })
    expect(c.LOGIN_ACCOUNT_MAX_FAILURES).toBe(3)
    expect(c.LOGIN_ACCOUNT_WINDOW_SECONDS).toBe(60)
    expect(c.PASSWORD_HASH_MAX_IN_FLIGHT).toBe(2)
  })

  it("aplica os nomes de cookie neutros por default (BRAND-01)", () => {
    const c = parseIdentityConfig(BASE)
    expect(c.COOKIE_NAME).toBe("__Host-app_session")
    expect(c.DEVICE_COOKIE_NAME).toBe("__Host-app_device")
    expect(c.CSRF_COOKIE_NAME).toBe("app_csrf")
  })

  it("deixa o produto renomear cada um dos três cookies", () => {
    const c = parseIdentityConfig({
      ...BASE,
      COOKIE_NAME: "__Host-produto_session",
      DEVICE_COOKIE_NAME: "__Host-produto_device",
      CSRF_COOKIE_NAME: "produto_csrf",
    })
    expect(c.COOKIE_NAME).toBe("__Host-produto_session")
    expect(c.DEVICE_COOKIE_NAME).toBe("__Host-produto_device")
    expect(c.CSRF_COOKIE_NAME).toBe("produto_csrf")
  })

  it("rejeita CSRF_COOKIE_NAME vazio (o SPA não teria o que ler)", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, CSRF_COOKIE_NAME: "" })
    ).toThrow(/CSRF_COOKIE_NAME/)
  })

  it("aceita COOKIE_SAMESITE=none com a API no mesmo host do front (SEAM-06)", () => {
    const c = parseIdentityConfig({
      ...BASE,
      COOKIE_SAMESITE: "none",
      API_ORIGIN: "http://localhost:3000",
    })
    expect(c.COOKIE_SAMESITE).toBe("none")
  })

  it("rejeita COOKIE_SAMESITE=none com a API em outro host (SEAM-06)", () => {
    expect(() =>
      parseIdentityConfig({
        ...BASE,
        COOKIE_SAMESITE: "none",
        API_ORIGIN: "https://api.exemplo.test",
      })
    ).toThrow(/API_ORIGIN no mesmo host de WEB_ORIGIN/)
  })

  it("rejeita COOKIE_SAMESITE=none sem API_ORIGIN declarado (fail-closed)", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, COOKIE_SAMESITE: "none" })
    ).toThrow(/API_ORIGIN/)
  })

  it("a mensagem do refuse diz o que fazer, não só o que está errado", () => {
    expect(() =>
      parseIdentityConfig({
        ...BASE,
        COOKIE_SAMESITE: "none",
        API_ORIGIN: "https://api.exemplo.test",
      })
    ).toThrow(/proxy reverso|COOKIE_SAMESITE=lax/)
  })

  it("não exige API_ORIGIN fora de COOKIE_SAMESITE=none", () => {
    const c = parseIdentityConfig({ ...BASE, COOKIE_SAMESITE: "lax" })
    expect(c.COOKIE_SAMESITE).toBe("lax")
    expect(c.API_ORIGIN).toBeUndefined()
  })

  it("rejeita limite de login zero ou negativo (desligaria o teto em silêncio)", () => {
    expect(() =>
      parseIdentityConfig({ ...BASE, LOGIN_ACCOUNT_MAX_FAILURES: "0" })
    ).toThrow(/LOGIN_ACCOUNT_MAX_FAILURES/)
    expect(() =>
      parseIdentityConfig({ ...BASE, PASSWORD_HASH_MAX_IN_FLIGHT: "-1" })
    ).toThrow(/PASSWORD_HASH_MAX_IN_FLIGHT/)
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

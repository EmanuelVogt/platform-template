import { describe, expect, it } from "vitest"

import { nodeEnvSchema, parseEnv } from "./env"

const BASE = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  DATABASE_SSL: "disable",
  WEB_ORIGIN: "http://localhost:5173",
  REDIS_URL: "redis://localhost:6379",
} as NodeJS.ProcessEnv

describe("parseEnv", () => {
  it("aplica defaults quando opcionais ausentes", () => {
    const e = parseEnv(BASE)
    expect(e.PORT).toBe(3000)
    expect(e.DATABASE_POOL_MAX).toBe(10)
    expect(e.OTEL_SERVICE_NAME).toBe("api")
    expect(e.SERVICE_VERSION).toBe("0.0.1")
    expect(e.TRUST_PROXY_HOPS).toBe(0)
    expect(e.REDIS_ALLOW_PLAINTEXT).toBe(false)
    expect(e.DOCS_ENABLED).toBe(false)
    expect(e.OUTBOX_DEAD_RETENTION_DAYS).toBe(30)
    expect(e.DATABASE_SSL_CA).toBeUndefined()
  })

  it("falha (fail-fast) sem NODE_ENV", () => {
    const { NODE_ENV: _omit, ...semNodeEnv } = BASE
    expect(() => parseEnv(semNodeEnv)).toThrow(/NODE_ENV/)
  })

  it("falha (fail-fast) sem DATABASE_SSL", () => {
    const { DATABASE_SSL: _omit, ...semSsl } = BASE
    expect(() => parseEnv(semSsl)).toThrow(/DATABASE_SSL/)
  })

  it("desescapa \\n em DATABASE_SSL_CA", () => {
    const e = parseEnv({
      ...BASE,
      DATABASE_SSL_CA: "-----BEGIN CERT-----\\nAAA\\n-----END CERT-----",
    })
    expect(e.DATABASE_SSL_CA).toBe(
      "-----BEGIN CERT-----\nAAA\n-----END CERT-----"
    )
  })

  it("recusa REDIS_URL redis:// em produção sem REDIS_ALLOW_PLAINTEXT", () => {
    expect(() =>
      parseEnv({ ...BASE, NODE_ENV: "production", DOCS_ENABLED: "true" })
    ).toThrow(/REDIS_URL/)
  })

  it("aceita REDIS_URL redis:// em produção com REDIS_ALLOW_PLAINTEXT=true", () => {
    const e = parseEnv({
      ...BASE,
      NODE_ENV: "production",
      REDIS_ALLOW_PLAINTEXT: "true",
      DOCS_ENABLED: "true",
    })
    expect(e.REDIS_URL).toBe(BASE.REDIS_URL)
  })

  it("aceita rediss:// em produção sem precisar de opt-in", () => {
    const e = parseEnv({
      ...BASE,
      NODE_ENV: "production",
      REDIS_URL: "rediss://h:6380",
      DOCS_ENABLED: "true",
    })
    expect(e.REDIS_URL).toBe("rediss://h:6380")
  })

  it("aceita DOCS_ENABLED=true em produção", () => {
    const e = parseEnv({
      ...BASE,
      NODE_ENV: "production",
      REDIS_ALLOW_PLAINTEXT: "true",
      DOCS_ENABLED: "true",
    })
    expect(e.DOCS_ENABLED).toBe(true)
  })

  it("coage PORT e DATABASE_POOL_MAX de string para número", () => {
    const e = parseEnv({
      ...BASE,
      PORT: "8080",
      DATABASE_POOL_MAX: "25",
    })
    expect(e.PORT).toBe(8080)
    expect(e.DATABASE_POOL_MAX).toBe(25)
  })

  it("falha (fail-fast) sem DATABASE_URL", () => {
    const { DATABASE_URL: _omit, ...semDatabase } = BASE
    expect(() => parseEnv(semDatabase)).toThrow(/DATABASE_URL/)
  })

  it("falha com DATABASE_URL inválida apontando o campo", () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: "notaurl" })).toThrow(
      /DATABASE_URL/
    )
  })

  it("rejeita DATABASE_URL com scheme não-postgres", () => {
    expect(() =>
      parseEnv({ ...BASE, DATABASE_URL: "https://localhost:5432/db" })
    ).toThrow(/DATABASE_URL/)
  })

  it("aceita scheme postgresql://", () => {
    const e = parseEnv({
      ...BASE,
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    })
    expect(e.DATABASE_URL).toContain("postgresql://")
  })

  it("falha com PORT não numérica", () => {
    expect(() => parseEnv({ ...BASE, PORT: "abc" })).toThrow()
  })

  it("exige WEB_ORIGIN (consumido pelo CORS)", () => {
    const { WEB_ORIGIN: _omit, ...semOrigin } = BASE
    expect(() => parseEnv(semOrigin)).toThrow(/WEB_ORIGIN/)
  })

  it("falha (fail-fast) sem REDIS_URL", () => {
    const { REDIS_URL: _omit, ...semRedis } = BASE
    expect(() => parseEnv(semRedis)).toThrow(/REDIS_URL/)
  })

  it("rejeita REDIS_URL com scheme não-redis", () => {
    expect(() =>
      parseEnv({ ...BASE, REDIS_URL: "http://localhost:6379" })
    ).toThrow(/REDIS_URL/)
  })

  it("aceita scheme rediss://", () => {
    const e = parseEnv({ ...BASE, REDIS_URL: "rediss://h:6380" })
    expect(e.REDIS_URL).toContain("rediss://")
  })

  it("aceita OTEL_EXPORTER_OTLP_ENDPOINT vazio", () => {
    const e = parseEnv({
      ...BASE,
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
    })
    expect(e.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("")
  })

  it("aceita APP_TIMEZONE ausente (sem default neste schema)", () => {
    const e = parseEnv(BASE)
    expect(e.APP_TIMEZONE).toBeUndefined()
  })

  it("aceita UTC em APP_TIMEZONE", () => {
    const e = parseEnv({ ...BASE, APP_TIMEZONE: "UTC" })
    expect(e.APP_TIMEZONE).toBe("UTC")
  })

  it("aceita um fuso IANA conhecido em APP_TIMEZONE", () => {
    const e = parseEnv({ ...BASE, APP_TIMEZONE: "America/Sao_Paulo" })
    expect(e.APP_TIMEZONE).toBe("America/Sao_Paulo")
  })

  it("rejeita APP_TIMEZONE fora do conjunto IANA conhecido pelo runtime", () => {
    expect(() => parseEnv({ ...BASE, APP_TIMEZONE: "Not/AZone" })).toThrow(
      /APP_TIMEZONE/
    )
  })
})

describe("nodeEnvSchema", () => {
  it("aceita development, test, staging e production", () => {
    for (const value of ["development", "test", "staging", "production"]) {
      expect(nodeEnvSchema.parse(value)).toBe(value)
    }
  })
})

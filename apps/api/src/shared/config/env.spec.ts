import { parseEnv } from "./env"
import { describe, expect, it } from "vitest"

const BASE = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  WEB_ORIGIN: "http://localhost:5173",
  REDIS_URL: "redis://localhost:6379",
} as NodeJS.ProcessEnv

describe("parseEnv", () => {
  it("aplica defaults quando opcionais ausentes", () => {
    const e = parseEnv(BASE)
    expect(e.NODE_ENV).toBe("development")
    expect(e.PORT).toBe(3222)
    expect(e.DATABASE_POOL_MAX).toBe(10)
    expect(e.OTEL_SERVICE_NAME).toBe("api")
    expect(e.SERVICE_VERSION).toBe("0.0.1")
    expect(e.TRUST_PROXY_HOPS).toBe(1)
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
      /DATABASE_URL/,
    )
  })

  it("rejeita DATABASE_URL com scheme não-postgres", () => {
    expect(() =>
      parseEnv({ ...BASE, DATABASE_URL: "https://localhost:5432/db" }),
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
      parseEnv({ ...BASE, REDIS_URL: "http://localhost:6379" }),
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
})

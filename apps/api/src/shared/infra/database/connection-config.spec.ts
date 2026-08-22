import { describe, expect, it } from "vitest"

import { parseEnv } from "../../config/env"

import {
  baseConnectionConfig,
  dedicatedConfig,
  poolConfig,
} from "./connection-config"

const BASE = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  WEB_ORIGIN: "http://localhost:5173",
  REDIS_URL: "redis://localhost:6379",
} as NodeJS.ProcessEnv

describe("connection-config", () => {
  describe("baseConnectionConfig", () => {
    it("deriva connectionString, statement_timeout e application_name do env", () => {
      const config = baseConnectionConfig(parseEnv(BASE))
      expect(config.connectionString).toBe(BASE.DATABASE_URL)
      expect(config.statement_timeout).toBe(30000)
      expect(config.application_name).toBe("api")
    })

    it("deriva idle_in_transaction_session_timeout do env, default igual ao statement timeout", () => {
      const config = baseConnectionConfig(parseEnv(BASE))
      expect(config.idle_in_transaction_session_timeout).toBe(30000)
    })

    it("respeita DATABASE_IDLE_IN_TX_TIMEOUT_MS configurado", () => {
      const config = baseConnectionConfig(
        parseEnv({ ...BASE, DATABASE_IDLE_IN_TX_TIMEOUT_MS: "500" })
      )
      expect(config.idle_in_transaction_session_timeout).toBe(500)
    })

    it("desliga TLS com DATABASE_SSL=disable", () => {
      const config = baseConnectionConfig(parseEnv(BASE))
      expect(config.ssl).toBe(false)
    })

    it("exige certificado válido com DATABASE_SSL=require", () => {
      const config = baseConnectionConfig(
        parseEnv({ ...BASE, DATABASE_SSL: "require" })
      )
      expect(config.ssl).toEqual({ rejectUnauthorized: true })
    })

    it("não carrega chaves de pool (é config de client)", () => {
      const config = baseConnectionConfig(parseEnv(BASE))
      expect(config).not.toHaveProperty("max")
      expect(config).not.toHaveProperty("idleTimeoutMillis")
    })
  })

  describe("poolConfig", () => {
    it("estende a config base com os limites do pool", () => {
      const config = poolConfig(parseEnv(BASE))
      expect(config.connectionString).toBe(BASE.DATABASE_URL)
      expect(config.statement_timeout).toBe(30000)
      expect(config.max).toBe(10)
      expect(config.connectionTimeoutMillis).toBe(10000)
      expect(config.idleTimeoutMillis).toBe(10000)
    })

    it("respeita os valores configurados no env", () => {
      const config = poolConfig(
        parseEnv({
          ...BASE,
          DATABASE_POOL_MAX: "4",
          DATABASE_CONNECTION_TIMEOUT_MS: "1500",
          DATABASE_IDLE_TIMEOUT_MS: "0",
          DATABASE_STATEMENT_TIMEOUT_MS: "7000",
        })
      )
      expect(config.max).toBe(4)
      expect(config.connectionTimeoutMillis).toBe(1500)
      expect(config.idleTimeoutMillis).toBe(0)
      expect(config.statement_timeout).toBe(7000)
    })

    it("respeita DATABASE_IDLE_IN_TX_TIMEOUT_MS configurado", () => {
      const config = poolConfig(
        parseEnv({ ...BASE, DATABASE_IDLE_IN_TX_TIMEOUT_MS: "250" })
      )
      expect(config.idle_in_transaction_session_timeout).toBe(250)
    })
  })

  describe("dedicatedConfig", () => {
    it("identifica o propósito no application_name", () => {
      const config = dedicatedConfig("advisory-lock", parseEnv(BASE))
      expect(config.application_name).toBe("api:advisory-lock")
    })

    it("mantém o restante da config base", () => {
      const env = parseEnv({ ...BASE, DATABASE_SSL: "require" })
      const config = dedicatedConfig("outbox-listen", env)
      expect(config.connectionString).toBe(BASE.DATABASE_URL)
      expect(config.statement_timeout).toBe(30000)
      expect(config.ssl).toEqual({ rejectUnauthorized: true })
    })

    it("carrega idle_in_transaction_session_timeout do env", () => {
      const config = dedicatedConfig(
        "advisory-lock",
        parseEnv({ ...BASE, DATABASE_IDLE_IN_TX_TIMEOUT_MS: "250" })
      )
      expect(config.idle_in_transaction_session_timeout).toBe(250)
    })
  })

  describe("teto da fila do pool", () => {
    it("aplica default 20 para DATABASE_POOL_MAX_WAITING", () => {
      expect(parseEnv(BASE).DATABASE_POOL_MAX_WAITING).toBe(20)
    })

    it("aplica default 500ms para DATABASE_POOL_ACQUIRE_WARN_MS", () => {
      expect(parseEnv(BASE).DATABASE_POOL_ACQUIRE_WARN_MS).toBe(500)
    })

    it("coage os dois de string para número", () => {
      const env = parseEnv({
        ...BASE,
        DATABASE_POOL_MAX_WAITING: "3",
        DATABASE_POOL_ACQUIRE_WARN_MS: "50",
      })
      expect(env.DATABASE_POOL_MAX_WAITING).toBe(3)
      expect(env.DATABASE_POOL_ACQUIRE_WARN_MS).toBe(50)
    })

    it("rejeita teto de fila zero ou negativo", () => {
      expect(() =>
        parseEnv({ ...BASE, DATABASE_POOL_MAX_WAITING: "0" })
      ).toThrow(/DATABASE_POOL_MAX_WAITING/)
      expect(() =>
        parseEnv({ ...BASE, DATABASE_POOL_MAX_WAITING: "-1" })
      ).toThrow(/DATABASE_POOL_MAX_WAITING/)
    })

    it("rejeita limiar de aquisição lenta não numérico", () => {
      expect(() =>
        parseEnv({ ...BASE, DATABASE_POOL_ACQUIRE_WARN_MS: "abc" })
      ).toThrow(/DATABASE_POOL_ACQUIRE_WARN_MS/)
    })
  })
})

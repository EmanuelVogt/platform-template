import { describe, expect, it } from "vitest"

import { parseEnv } from "../../config/env"

import { DEFAULT_MESSAGE_PACK, messagePackFor } from "./message-pack"

const BASE_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  DATABASE_SSL: "disable",
  WEB_ORIGIN: "http://localhost:5173",
  REDIS_URL: "redis://localhost:6379",
} as NodeJS.ProcessEnv

describe("messagePackFor", () => {
  it("pt-BR retorna as strings atuais do kernel", () => {
    expect(messagePackFor("pt-BR")).toEqual({
      validationTitle: "Erro de validação",
      validationDetail: "Payload inválido",
      internalTitle: "Erro interno",
    })
  })

  it("locale sem pacote dedicado cai no pacote padrão", () => {
    expect(messagePackFor("en-US")).toEqual(DEFAULT_MESSAGE_PACK)
  })

  it("DEFAULT_LOCALE do env, sem configuração explícita, resolve para pt-BR", () => {
    const parsed = parseEnv(BASE_ENV)
    expect(parsed.DEFAULT_LOCALE).toBe("pt-BR")
    expect(messagePackFor(parsed.DEFAULT_LOCALE)).toEqual(DEFAULT_MESSAGE_PACK)
  })
})

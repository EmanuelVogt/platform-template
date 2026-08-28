import { describe, expect, it } from "vitest"

import { isStorageConfigured, parseStorageConfig } from "./storage.config"

const valid = {
  STORAGE_ACCESS_KEY_ID: "key",
  STORAGE_SECRET_ACCESS_KEY: "secret",
  STORAGE_BUCKET: "platform",
  STORAGE_ENDPOINT: "https://acc.s3.example.com",
  STORAGE_REGION: "us-east-1",
}

describe("storage.config", () => {
  it("parseia env válida", () => {
    expect(parseStorageConfig(valid).STORAGE_BUCKET).toBe("platform")
  })

  it("rejeita endpoint não-URL", () => {
    expect(() =>
      parseStorageConfig({ ...valid, STORAGE_ENDPOINT: "x" })
    ).toThrow(/Configuração de storage inválida/)
  })

  it("rejeita chave faltando", () => {
    const { STORAGE_BUCKET: _STORAGE_BUCKET, ...rest } = valid
    expect(() => parseStorageConfig(rest)).toThrow()
  })

  it("rejeita STORAGE_REGION faltando", () => {
    const { STORAGE_REGION: _STORAGE_REGION, ...rest } = valid
    expect(() => parseStorageConfig(rest)).toThrow()
  })

  it("aplica os defaults de timeout/sockets quando ausentes", () => {
    const cfg = parseStorageConfig(valid)
    expect(cfg.STORAGE_REQUEST_TIMEOUT_MS).toBe(30_000)
    expect(cfg.STORAGE_MAX_SOCKETS).toBe(50)
  })

  it("coage STORAGE_REQUEST_TIMEOUT_MS/STORAGE_MAX_SOCKETS de string pra number", () => {
    const cfg = parseStorageConfig({
      ...valid,
      STORAGE_REQUEST_TIMEOUT_MS: "45000",
      STORAGE_MAX_SOCKETS: "20",
    })
    expect(cfg.STORAGE_REQUEST_TIMEOUT_MS).toBe(45_000)
    expect(cfg.STORAGE_MAX_SOCKETS).toBe(20)
  })

  it("isStorageConfigured é falso sem nenhuma var STORAGE_* e verdadeiro com apenas uma presente", () => {
    expect(isStorageConfigured({})).toBe(false)
    expect(isStorageConfigured({ STORAGE_BUCKET: "platform" })).toBe(true)
  })
})

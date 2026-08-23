import { describe, expect, it } from "vitest"

import { parseStorageConfig } from "./storage.config"

const valid = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "platform",
  R2_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
}

describe("storage.config", () => {
  it("parseia env válida", () => {
    expect(parseStorageConfig(valid).R2_BUCKET).toBe("platform")
  })

  it("rejeita endpoint não-URL", () => {
    expect(() => parseStorageConfig({ ...valid, R2_ENDPOINT: "x" })).toThrow(
      /Configuração de storage inválida/,
    )
  })

  it("rejeita chave faltando", () => {
    const { R2_BUCKET: _R2_BUCKET, ...rest } = valid
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
})

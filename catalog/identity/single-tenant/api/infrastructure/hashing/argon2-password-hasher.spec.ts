import { describe, expect, it, vi } from "vitest"

import { Argon2PasswordHasher } from "./argon2-password-hasher"

const opts = {
  pepper: "x".repeat(32),
  memoryKib: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
}

describe("Argon2PasswordHasher", () => {
  vi.setConfig({ testTimeout: 20000 })

  it("faz round-trip: hash verifica com a senha correta", async () => {
    const hasher = new Argon2PasswordHasher(opts)
    const hash = await hasher.hash("senha-correta-123")
    expect(hash.startsWith("$argon2id$")).toBe(true)
    expect(await hasher.verify("senha-correta-123", hash)).toBe(true)
  })

  it("rejeita senha errada", async () => {
    const hasher = new Argon2PasswordHasher(opts)
    const hash = await hasher.hash("senha-correta-123")
    expect(await hasher.verify("senha-errada", hash)).toBe(false)
  })

  it("o pepper muda o hash: hash de outro pepper não verifica", async () => {
    const a = new Argon2PasswordHasher(opts)
    const b = new Argon2PasswordHasher({ ...opts, pepper: "y".repeat(32) })
    const hash = await a.hash("mesma-senha-123")
    expect(await b.verify("mesma-senha-123", hash)).toBe(false)
  })

  it("needsRehash é false para hash dos params correntes", async () => {
    const hasher = new Argon2PasswordHasher(opts)
    const hash = await hasher.hash("senha-123")
    expect(hasher.needsRehash(hash)).toBe(false)
  })

  it("needsRehash é true quando os params subiram", async () => {
    const weak = new Argon2PasswordHasher({ ...opts, memoryKib: 19456 })
    const hash = await weak.hash("senha-123")
    const strong = new Argon2PasswordHasher({ ...opts, memoryKib: 65536 })
    expect(strong.needsRehash(hash)).toBe(true)
  })
})

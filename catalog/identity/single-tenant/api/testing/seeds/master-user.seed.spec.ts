import { afterEach, describe, expect, it, vi } from "vitest"

import { masterUserSeed, resolveMasterPassword } from "./master-user.seed"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { PasswordHasher } from "../../domain/ports/password-hasher"

function makeDb(returning: { id: string }[]): DrizzleDb {
  const returningFn = vi.fn().mockResolvedValue(returning)
  const onConflictDoNothingFn = vi.fn().mockReturnValue({ returning: returningFn })
  const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingFn })
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn })
  return { insert: insertFn } as unknown as DrizzleDb
}

function makeHasher(): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue("hash-fake"),
    verify: vi.fn(),
    needsRehash: vi.fn(),
  }
}

describe("resolveMasterPassword (REM-28)", () => {
  const original = process.env.SEED_MASTER_PASSWORD

  afterEach(() => {
    if (original === undefined) delete process.env.SEED_MASTER_PASSWORD
    else process.env.SEED_MASTER_PASSWORD = original
  })

  it("SEED_MASTER_PASSWORD setado: retorna o valor do env, generated=false", () => {
    process.env.SEED_MASTER_PASSWORD = "senha-fixa-do-env"

    expect(resolveMasterPassword()).toEqual({
      password: "senha-fixa-do-env",
      generated: false,
    })
  })

  it("SEED_MASTER_PASSWORD ausente: gera uma senha de 32 caracteres, generated=true", () => {
    delete process.env.SEED_MASTER_PASSWORD

    const result = resolveMasterPassword()

    expect(result.generated).toBe(true)
    // randomBytes(24).toString("base64url") — 24 é múltiplo de 3, então o
    // comprimento é sempre 32 (sem padding), independente do conteúdo sorteado.
    expect(result.password).toHaveLength(32)
  })
})

describe("masterUserSeed.run (REM-28)", () => {
  const original = process.env.SEED_MASTER_PASSWORD

  afterEach(() => {
    if (original === undefined) delete process.env.SEED_MASTER_PASSWORD
    else process.env.SEED_MASTER_PASSWORD = original
  })

  it("SEED_MASTER_PASSWORD ausente: imprime a senha gerada exatamente uma vez", async () => {
    delete process.env.SEED_MASTER_PASSWORD
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true)

    try {
      await masterUserSeed.run({ db: makeDb([{ id: "u1" }]), hasher: makeHasher() })

      const generatedPasswordLines = writeSpy.mock.calls.filter(
        ([chunk]) => typeof chunk === "string" && chunk.includes("senha gerada:")
      )
      expect(generatedPasswordLines).toHaveLength(1)
    } finally {
      writeSpy.mockRestore()
    }
  })
})

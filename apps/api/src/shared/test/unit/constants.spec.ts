import path from "node:path"

import { describe, expect, it } from "vitest"

import { FIXED_NOW, TEST_PASSWORD } from "./constants"
import { readFiles } from "./source-survey"

const HARNESS_ROOT = path.resolve(__dirname, "..")

const ISO_LITERAL = /["'`]\d{4}-\d{2}-\d{2}T[\d:.]+Z["'`]/

describe("constantes do harness", () => {
  it("FIXED_NOW é um instante ISO válido", () => {
    expect(new Date(FIXED_NOW).toISOString()).toBe(FIXED_NOW)
  })

  it("TEST_PASSWORD é forte o bastante para as políticas de senha das entradas", () => {
    expect(TEST_PASSWORD.length).toBeGreaterThanOrEqual(12)
    expect(TEST_PASSWORD).toMatch(/[a-z]/)
    expect(TEST_PASSWORD).toMatch(/[A-Z]/)
    expect(TEST_PASSWORD).toMatch(/[0-9]/)
  })

  it("nenhum outro helper do harness carrega um literal de data — todos vêm de constants.ts", () => {
    const offenders = readFiles(
      HARNESS_ROOT,
      (rel) =>
        rel.endsWith(".ts") &&
        !rel.endsWith(".spec.ts") &&
        !rel.endsWith("constants.ts")
    )
      .filter((file) => ISO_LITERAL.test(file.content))
      .map((file) => file.rel)

    expect(offenders).toEqual([])
  })
})

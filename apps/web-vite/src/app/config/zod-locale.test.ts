import { describe, expect, it } from "vitest"
import { z } from "zod"

import "./zod-locale"

describe("zod-locale", () => {
  it("traduz string obrigatória", () => {
    const schema = z.string().min(1)
    expect(() => schema.parse("")).toThrow("Campo obrigatório.")
  })

  it("traduz min > 1", () => {
    const schema = z.string().min(3)
    expect(() => schema.parse("a")).toThrow("Use ao menos 3 caracteres.")
  })

  it("traduz max de string", () => {
    const schema = z.string().max(2)
    expect(() => schema.parse("abc")).toThrow("Use no máximo 2 caracteres.")
  })

  it("traduz invalid_type string ausente", () => {
    const schema = z.string()
    expect(() => schema.parse(undefined)).toThrow("Campo obrigatório.")
  })

  it("delega outros códigos ao locale pt", () => {
    const schema = z.number()
    expect(() => schema.parse("x")).toThrow()
  })
})

import { isUniqueViolation } from "./pg-errors"
import { describe, expect, it } from "vitest"

describe("isUniqueViolation", () => {
  it("detecta código 23505 no erro direto", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true)
  })

  it("detecta código 23505 em cause (DrizzleQueryError)", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true)
  })

  it("retorna false para outros erros", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false)
    expect(isUniqueViolation(new Error("fail"))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})

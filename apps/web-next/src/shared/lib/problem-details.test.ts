import { describe, expect, it } from "vitest"

import {
  getProblemDetail,
  getProblemExtension,
  getProblemType,
  isProblem,
} from "./problem-details"

const flat = {
  type: "https://errors.test/invalid",
  title: "Inválido",
  detail: "Campo obrigatório.",
  errors: ["email"],
}
const nested = { response: { data: flat } }

describe("problem-details", () => {
  it("reconhece shape flat e aninhado", () => {
    expect(isProblem(flat)).toBe(true)
    expect(isProblem(nested)).toBe(true)
  })

  it.each([null, "texto", 42, {}, { response: { data: {} } }])(
    "recusa não-problem (%s)",
    (value) => {
      expect(isProblem(value)).toBe(false)
    }
  )

  it("extrai o type nos dois shapes", () => {
    expect(getProblemType(flat)).toBe(flat.type)
    expect(getProblemType(nested)).toBe(flat.type)
    expect(getProblemType({})).toBe("")
  })

  it("extrai a mensagem user-facing, com fallback no title", () => {
    expect(getProblemDetail(nested)).toBe("Campo obrigatório.")
    expect(getProblemDetail({ title: "Só título" })).toBe("Só título")
    expect(getProblemDetail({})).toBe("")
  })

  it("extrai membro de extensão nos dois shapes", () => {
    expect(getProblemExtension(flat, "errors")).toEqual(["email"])
    expect(getProblemExtension(nested, "errors")).toEqual(["email"])
    expect(getProblemExtension(null, "errors")).toBeUndefined()
    expect(getProblemExtension({}, "errors")).toBeUndefined()
  })
})

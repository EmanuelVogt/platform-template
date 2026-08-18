import { describe, expect, it } from "vitest"

import { loginSchema } from "./login.schema"

describe("loginSchema", () => {
  it("aceita input válido", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "secret",
      rememberMe: true,
    })
    expect(result.success).toBe(true)
  })

  it("rejeita e-mail inválido", () => {
    const result = loginSchema.safeParse({
      email: "nope",
      password: "secret",
      rememberMe: false,
    })
    expect(result.success).toBe(false)
  })

  it("rejeita senha vazia", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "",
      rememberMe: false,
    })
    expect(result.success).toBe(false)
  })
})

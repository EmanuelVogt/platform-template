import { afterEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

describe("env", () => {
  const originalValue = process.env.NEXT_PUBLIC_API_URL

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalValue
    vi.resetModules()
  })

  it("expõe apiUrl a partir de NEXT_PUBLIC_API_URL no boot do vitest", async () => {
    const { env } = await import("./env")
    expect(env.apiUrl).toBe("http://localhost:3000")
  })

  it("lança ZodError em pt-BR quando NEXT_PUBLIC_API_URL está ausente", async () => {
    vi.resetModules()
    delete process.env.NEXT_PUBLIC_API_URL
    let caught: unknown
    try {
      await import("./env")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ZodError)
    expect((caught as ZodError).issues[0]?.message).toBe("Campo obrigatório.")
  })

  it("lança ZodError em pt-BR quando NEXT_PUBLIC_API_URL não é uma URL válida", async () => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_API_URL = "nao-e-uma-url"
    let caught: unknown
    try {
      await import("./env")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ZodError)
    expect((caught as ZodError).issues[0]?.message).toBe("URL inválido")
  })
})

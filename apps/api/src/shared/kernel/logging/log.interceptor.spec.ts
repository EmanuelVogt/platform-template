import { stripQuery } from "./log.interceptor"
import { describe, expect, it } from "vitest"

describe("stripQuery", () => {
  it("remove a query string", () => {
    expect(stripQuery("/v1/auth/reset-password?token=segredo")).toBe(
      "/v1/auth/reset-password"
    )
  })

  it("mantém a url sem query intacta", () => {
    expect(stripQuery("/v1/auth/login")).toBe("/v1/auth/login")
  })
})

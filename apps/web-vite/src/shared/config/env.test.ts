import { describe, expect, it } from "vitest"

import { env } from "./env"

describe("env", () => {
  it("exige VITE_API_URL no boot do vitest", () => {
    expect(env.VITE_API_URL).toBe("http://localhost:3000")
  })
})

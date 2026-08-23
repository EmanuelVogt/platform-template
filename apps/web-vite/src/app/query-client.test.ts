import { describe, expect, it } from "vitest"

import { queryClient } from "./query-client"

describe("queryClient", () => {
  it("aplica defaults conservadores de cache", () => {
    const defaults = queryClient.getDefaultOptions().queries
    expect(defaults?.staleTime).toBe(10_000)
    expect(defaults?.gcTime).toBe(5 * 60_000)
    expect(defaults?.retry).toBe(1)
    expect(defaults?.refetchOnWindowFocus).toBe(true)
    expect(defaults?.refetchOnReconnect).toBe(true)
  })
})

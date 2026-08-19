import { describe, expect, it, vi } from "vitest"

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock("@platform/api-client/hooks/useGetSession", () => ({
  getSession,
}))

import { sessionQueryOptions } from "./session.options"
import { sessionKeys } from "./session.keys"

describe("sessionQueryOptions", () => {
  it("usa a key current e não refaz retry em 401", () => {
    expect(sessionQueryOptions.queryKey).toEqual(sessionKeys.current())
    expect(sessionQueryOptions.retry).toBe(false)
    expect(sessionQueryOptions.staleTime).toBe(Infinity)
    expect(sessionQueryOptions.refetchOnWindowFocus).toBe(false)
  })

  it("delega ao getSession com signal", async () => {
    getSession.mockResolvedValue({ user: { id: "1" } })
    const signal = new AbortController().signal
    await sessionQueryOptions.queryFn?.({ signal } as never)
    expect(getSession).toHaveBeenCalledWith({ signal })
  })
})

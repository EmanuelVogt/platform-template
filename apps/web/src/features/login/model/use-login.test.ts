import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useLogin } from "./use-login"

const { loginMutation } = vi.hoisted(() => ({
  loginMutation: { mutateAsync: vi.fn(), isPending: false },
}))
vi.mock("@/entities/session/api/session.queries", () => ({
  useLogin: () => loginMutation,
}))

describe("useLogin (feature)", () => {
  it("expõe a mutation da entity (mutateAsync + isPending)", () => {
    const { result } = renderHook(() => useLogin())
    expect(result.current.mutateAsync).toBe(loginMutation.mutateAsync)
    expect(result.current).toHaveProperty("isPending")
  })
})

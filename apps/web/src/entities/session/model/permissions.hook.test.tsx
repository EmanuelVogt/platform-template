import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { sessionKeys } from "../api/session.keys"

import { useCan } from "./permissions"

import type { ReactNode } from "react"

vi.mock("@platform/api-client/hooks/useGetSession", () => ({
  getSession: vi.fn(() => Promise.resolve(null)),
}))

describe("useCan — sem sessão", () => {
  it("retorna false para qualquer chave quando não há sessão", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
    const { result } = renderHook(() => useCan(), { wrapper })
    expect(result.current("admin.users.read")).toBe(false)
  })
})

describe("useCan — com sessão", () => {
  it("delega ao can quando há user", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(sessionKeys.current(), {
      user: { permissions: ["admin.users.read"], accessProfile: "admin" },
    })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
    const { result } = renderHook(() => useCan(), { wrapper })
    expect(result.current("admin.users.read")).toBe(true)
    expect(result.current("admin.users.create")).toBe(false)
  })
})

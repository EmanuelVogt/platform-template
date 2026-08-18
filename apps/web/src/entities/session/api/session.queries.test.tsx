import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/shared/store/auth.store"

import { sessionKeys } from "./session.keys"
import { useLogin, useLogout, useSession } from "./session.queries"

import type { ReactNode } from "react"

const { loginHook, logoutHook, sessionFetch } = vi.hoisted(() => ({
  loginHook: vi.fn(),
  logoutHook: vi.fn(),
  sessionFetch: vi.fn(),
}))

vi.mock("@platform/api-client/hooks/useGetSession", () => ({
  getSession: sessionFetch,
}))
vi.mock("@platform/api-client/hooks/useLogin", () => ({
  useLogin: loginHook,
}))
vi.mock("@platform/api-client/hooks/useLogout", () => ({
  useLogout: logoutHook,
}))

const user = { id: "u-1", name: "Ana", email: "ana@x.com", emailVerified: true }

let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe("session.queries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    useAuthStore.setState({ redirectIntent: null })
    loginHook.mockReturnValue({ mutate: vi.fn(), isPending: false })
    logoutHook.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it("useSession devolve o user do cache", async () => {
    qc.setQueryData(sessionKeys.current(), { user })
    const { result } = renderHook(() => useSession(), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.user).toEqual(user)
    })
  })

  it("useLogin injeta o user no cache no onSuccess", () => {
    renderHook(() => useLogin(), { wrapper })
    const opts = loginHook.mock.calls.at(-1)?.[0] as {
      mutation: { onSuccess: (data: unknown) => void }
    }
    act(() => {
      opts.mutation.onSuccess({ user })
    })
    expect(qc.getQueryData(sessionKeys.current())).toEqual({ user })
  })

  it("useLogout limpa o cache e avisa as outras abas no onSuccess", () => {
    qc.setQueryData(sessionKeys.current(), { user })
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    renderHook(() => useLogout(), { wrapper })
    const opts = logoutHook.mock.calls.at(-1)?.[0] as {
      mutation: { onSuccess: () => void }
    }
    act(() => {
      opts.mutation.onSuccess()
    })
    expect(qc.getQueryData(sessionKeys.current())).toBeUndefined()
    expect(setItem).toHaveBeenCalledWith("rit-auth-logout", expect.any(String))
    setItem.mockRestore()
  })
})

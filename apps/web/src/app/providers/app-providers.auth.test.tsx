import { render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { queryClient } from "@/app/query-client"

import { AppProviders } from "./app-providers"

import type * as ReactRouterModule from "@tanstack/react-router"

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock("@/app/router/router", () => ({
  router: { navigate },
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterModule>()
  return {
    ...actual,
    RouterProvider: () => null,
  }
})

describe("AppProviders CrossTabLogout", () => {
  it("limpa cache e navega para login em logout cross-tab", async () => {
    const clearSpy = vi.spyOn(queryClient, "clear")
    render(<AppProviders />)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "rit-auth-logout",
        newValue: String(Date.now()),
      }),
    )

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith({ to: "/entrar" })
    })
    clearSpy.mockRestore()
  })
})

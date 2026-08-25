import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "./auth.store"

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ redirectIntent: null })
  })

  it("guarda e limpa a intenção de redirect", () => {
    useAuthStore.getState().setRedirectIntent("/inicio")
    expect(useAuthStore.getState().redirectIntent).toBe("/inicio")
    useAuthStore.getState().setRedirectIntent(null)
    expect(useAuthStore.getState().redirectIntent).toBeNull()
  })

  it("broadcastLogout grava timestamp no canal cross-tab", () => {
    useAuthStore.getState().broadcastLogout()
    expect(localStorage.getItem("app-auth-logout")).toMatch(/^\d+$/)
  })

  it("subscribeCrossTabLogout dispara callback em storage event válido", () => {
    const onForeignLogout = vi.fn()
    const unsubscribe = useAuthStore
      .getState()
      .subscribeCrossTabLogout(onForeignLogout)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "app-auth-logout",
        newValue: "123",
      })
    )
    expect(onForeignLogout).toHaveBeenCalledOnce()

    window.dispatchEvent(
      new StorageEvent("storage", { key: "other", newValue: "x" })
    )
    expect(onForeignLogout).toHaveBeenCalledOnce()

    unsubscribe()
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "app-auth-logout",
        newValue: "456",
      })
    )
    expect(onForeignLogout).toHaveBeenCalledOnce()
  })
})

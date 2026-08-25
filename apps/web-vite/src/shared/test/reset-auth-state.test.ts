import { describe, expect, it } from "vitest"

import { useAuthStore } from "@/shared/store/auth.store"

import { resetAuthState } from "./reset-auth-state"

describe("resetAuthState", () => {
  it("limpa o localStorage e zera o redirectIntent do store", () => {
    localStorage.setItem("alguma-chave", "valor")
    useAuthStore.setState({ redirectIntent: "/inicio" })

    resetAuthState()

    expect(localStorage.getItem("alguma-chave")).toBeNull()
    expect(useAuthStore.getState().redirectIntent).toBeNull()
  })
})

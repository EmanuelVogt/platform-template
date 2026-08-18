import { beforeEach, describe, expect, it } from "vitest"

import { ROUTES } from "@/shared/config/routes"
import { useAuthStore } from "@/shared/store/auth.store"

import { resolveAuthedTarget } from "./auth-redirect"
import { persistLastLocation } from "./last-location"

describe("resolveAuthedTarget", () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ redirectIntent: null })
  })

  it("cai no início sem intenção nem memória", () => {
    expect(resolveAuthedTarget()).toBe(ROUTES.INICIO)
  })

  it("prefere a intenção guardada pelo guard", () => {
    useAuthStore.setState({ redirectIntent: "/inicio" })
    expect(resolveAuthedTarget()).toBe(ROUTES.INICIO)
  })

  it("descarta intenção fora da allowlist", () => {
    useAuthStore.setState({ redirectIntent: "https://evil.test" })
    expect(resolveAuthedTarget()).toBe(ROUTES.INICIO)
  })

  it("usa a última rota protegida visitada", () => {
    persistLastLocation("/inicio")
    expect(resolveAuthedTarget()).toBe(ROUTES.INICIO)
  })
})

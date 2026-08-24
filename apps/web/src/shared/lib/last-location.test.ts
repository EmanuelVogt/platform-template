import { beforeEach, describe, expect, it } from "vitest"

import { registerProtectedRoute, ROUTES } from "@/shared/config/routes"

import {
  forgetLastLocation,
  persistLastLocation,
  readLastLocation,
} from "./last-location"

describe("last-location", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("persiste apenas rotas protegidas válidas", () => {
    persistLastLocation("/entrar")
    expect(localStorage.getItem("rit-last-location")).toBeNull()
    persistLastLocation(ROUTES.INICIO)
    expect(readLastLocation()).toBe(ROUTES.INICIO)
  })

  it("forgetLastLocation remove só quando bate com a memória", () => {
    persistLastLocation(ROUTES.INICIO)
    forgetLastLocation("/entrar")
    expect(readLastLocation()).toBe(ROUTES.INICIO)
    forgetLastLocation(ROUTES.INICIO)
    expect(readLastLocation()).toBeNull()
  })

  it("persiste e lê uma rota de produto registrada com registerProtectedRoute", () => {
    registerProtectedRoute("/produto/relatorios")
    persistLastLocation("/produto/relatorios")
    expect(readLastLocation()).toBe("/produto/relatorios")
  })

  it("forgetLastLocation também remove uma rota de produto registrada", () => {
    registerProtectedRoute("/produto/relatorios")
    persistLastLocation("/produto/relatorios")
    forgetLastLocation("/produto/relatorios")
    expect(readLastLocation()).toBeNull()
  })
})

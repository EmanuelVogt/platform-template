import { describe, expect, it } from "vitest"

import {
  ROUTES,
  resolveProtectedRouteTemplate,
  toSafeProtectedRoute,
} from "./routes"

describe("toSafeProtectedRoute", () => {
  it("aceita rota protegida da allowlist", () => {
    expect(toSafeProtectedRoute(ROUTES.INICIO)).toBe(ROUTES.INICIO)
  })

  it("ignora query e hash antes de validar", () => {
    expect(toSafeProtectedRoute("/inicio?a=1#b")).toBe(ROUTES.INICIO)
  })

  it.each([null, undefined, "", "/entrar", "https://evil.test/inicio"])(
    "recusa destino fora da allowlist (%s)",
    (path) => {
      expect(toSafeProtectedRoute(path)).toBeNull()
    }
  )
})

describe("resolveProtectedRouteTemplate", () => {
  it("resolve template paramétrico sob /inicio", () => {
    expect(resolveProtectedRouteTemplate("/inicio/detalhe")).toBe(
      "/inicio/$segment"
    )
    expect(toSafeProtectedRoute("/inicio/detalhe")).toBe("/inicio/detalhe")
  })

  it("rejeita pathname com segmentos a mais que o template", () => {
    expect(resolveProtectedRouteTemplate("/inicio/a/b")).toBeNull()
  })

  it("devolve null para path desconhecido", () => {
    expect(resolveProtectedRouteTemplate("/nao-existe")).toBeNull()
  })

  it("devolve o template exato quando bate", () => {
    expect(resolveProtectedRouteTemplate("/inicio")).toBe(ROUTES.INICIO)
  })
})

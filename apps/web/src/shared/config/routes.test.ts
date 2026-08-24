import { afterEach, describe, expect, it, vi } from "vitest"

import {
  registerProtectedRoute,
  ROUTES,
  resolveProtectedRouteTemplate,
  toSafeProtectedRoute,
  WEB_COPY,
} from "./routes"

describe("routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  describe("registerProtectedRoute", () => {
    it("um path exato registrado pelo produto participa de toSafeProtectedRoute", () => {
      expect(toSafeProtectedRoute("/produto/painel")).toBeNull()
      registerProtectedRoute("/produto/painel")
      expect(toSafeProtectedRoute("/produto/painel")).toBe("/produto/painel")
    })

    it("um template com $param registrado pelo produto participa de resolveProtectedRouteTemplate", () => {
      registerProtectedRoute("/produto/$id")
      expect(resolveProtectedRouteTemplate("/produto/42")).toBe("/produto/$id")
      expect(toSafeProtectedRoute("/produto/42")).toBe("/produto/42")
    })

    it("path nunca registrado continua fora da allowlist", () => {
      expect(toSafeProtectedRoute("/rota-nunca-registrada")).toBeNull()
    })
  })

  describe("slugs de rota via VITE_ROUTE_LOGIN / VITE_ROUTE_INICIO", () => {
    it("sem as variáveis definidas, os slugs são os de hoje byte-a-byte", () => {
      expect(ROUTES.LOGIN).toBe("/entrar")
      expect(ROUTES.INICIO).toBe("/inicio")
      expect(WEB_COPY.backToHome).toBe("Voltar ao início")
    })

    it("VITE_ROUTE_LOGIN definido sobrescreve o slug de login", async () => {
      vi.stubEnv("VITE_ROUTE_LOGIN", "/login")
      vi.resetModules()
      const { ROUTES: freshRoutes } = await import("./routes")
      expect(freshRoutes.LOGIN).toBe("/login")
    })

    it("VITE_ROUTE_INICIO definido sobrescreve o slug de início", async () => {
      vi.stubEnv("VITE_ROUTE_INICIO", "/home")
      vi.resetModules()
      const { ROUTES: freshRoutes } = await import("./routes")
      expect(freshRoutes.INICIO).toBe("/home")
    })
  })

  describe("WEB_COPY", () => {
    it("é a única fonte de copy para RoutePending, NotFoundPage e ErrorPage", () => {
      expect(WEB_COPY).toMatchObject({
        loading: "Carregando…",
        notFoundTitle: "Página não encontrada",
        errorTitle: "Algo deu errado",
        retry: "Tentar novamente",
        backToHome: "Voltar ao início",
      })
    })
  })
})

import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import { productRoutes } from "./product-routes"
import { createAppRouter, router } from "./router"

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe("routeTree", () => {
  it("registra a raiz, o layout da área logada e o início — sem login", () => {
    expect(Object.keys(router.routesById).sort()).toEqual([
      "/",
      "/authenticated",
      "/authenticated/inicio",
      "__root__",
    ])
  })

  it("sobe sem rota de produto — a lista é a costura de extensão", () => {
    expect(productRoutes).toHaveLength(0)
  })
})

describe("createAppRouter", () => {
  it("serializa arrays de string como CSV na query", () => {
    const client = makeClient()
    const appRouter = createAppRouter({ queryClient: client })
    expect(appRouter.options.stringifySearch({ layers: ["a", "b"] })).toBe(
      "?layers=a%2Cb"
    )
  })

  it("serializa arrays mistos como JSON", () => {
    const client = makeClient()
    const appRouter = createAppRouter({ queryClient: client })
    expect(appRouter.options.stringifySearch({ layers: ["a", 1] })).toBe(
      "?layers=%5B%22a%22%2C1%5D"
    )
  })

  it("serializa valores não-array como JSON", () => {
    const client = makeClient()
    const appRouter = createAppRouter({ queryClient: client })
    expect(appRouter.options.stringifySearch({ n: 1 })).toBe("?n=1")
  })
})

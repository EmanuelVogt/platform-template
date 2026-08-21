import { describe, expect, it } from "vitest"

import { appLayoutRoute, indexRoute, inicioRoute, rootRoute } from "./shell"

describe("shell route loaders", () => {
  it("indexRoute redireciona a raiz para o início", () => {
    const loader = indexRoute.options.beforeLoad
    let thrown: unknown
    try {
      loader?.({} as never)
    } catch (error) {
      thrown = error
    }
    expect((thrown as { options?: { to?: string } } | undefined)?.options?.to).toBe(
      "/inicio"
    )
  })

  it("o layout da área logada sobe sem guard — o template não exige sessão", () => {
    expect(appLayoutRoute.options.beforeLoad).toBeUndefined()
  })

  it("o vocabulário de acesso das rotas do template é public/authenticated", () => {
    expect(rootRoute.options.staticData.access).toEqual({ kind: "public" })
    expect(indexRoute.options.staticData.access).toEqual({ kind: "public" })
    expect(appLayoutRoute.options.staticData.access).toEqual({
      kind: "authenticated",
    })
    expect(inicioRoute.options.staticData.access).toEqual({
      kind: "authenticated",
    })
  })

  it("rootRoute component está definido", () => {
    expect(rootRoute.options.component).toBeTypeOf("function")
  })
})

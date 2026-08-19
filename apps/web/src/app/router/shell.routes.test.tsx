import { describe, expect, it } from "vitest"

import { inicioRoute, loginRoute, rootRoute } from "./shell"

describe("shell route options", () => {
  it("rootRoute expõe título padrão", () => {
    const head = rootRoute.options.head?.({} as never)
    expect(head?.meta?.[0]?.title).toBe("Platform")
  })

  it("loginRoute expõe título de entrar", () => {
    const head = loginRoute.options.head?.({} as never)
    expect(head?.meta?.[0]?.title).toBe("Entrar · Platform")
  })

  it("inicioRoute expõe título de início", () => {
    const head = inicioRoute.options.head?.({} as never)
    expect(head?.meta?.[0]?.title).toBe("Início · Platform")
  })
})

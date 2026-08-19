import { describe, expect, it } from "vitest"

import { inicioRoute, loginRoute, rootRoute } from "./shell"

describe("shell route options", () => {
  it("rootRoute expõe título padrão", async () => {
    const head = await rootRoute.options.head?.({} as never)
    expect(head?.meta?.[0]?.title).toBe("Platform")
  })

  it("loginRoute expõe título de entrar", async () => {
    const head = await loginRoute.options.head?.({} as never)
    expect(head?.meta?.[0]?.title).toBe("Entrar · Platform")
  })

  it("inicioRoute expõe título de início", async () => {
    const head = await inicioRoute.options.head?.({} as never)
    expect(head?.meta?.[0]?.title).toBe("Início · Platform")
  })
})

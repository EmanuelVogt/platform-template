import { describe, expect, it } from "vitest"

import { pageTitle } from "./shell"

describe("pageTitle", () => {
  it("usa só o nome do app sem label", () => {
    expect(pageTitle()).toBe("Platform")
  })

  it("prefixa label com separador", () => {
    expect(pageTitle("Início")).toBe("Início · Platform")
  })
})

import { describe, expect, it } from "vitest"

import { ROUTE_ACCESS } from "./route-access"
import { ROUTES } from "./routes"

describe("ROUTE_ACCESS", () => {
  it("cobre toda entrada de ROUTES com uma linha de acesso", () => {
    for (const path of Object.values(ROUTES)) {
      expect(ROUTE_ACCESS[path], `rota sem ROUTE_ACCESS: ${path}`).toBeDefined()
    }
  })

  it("toda linha kind: permission carrega key", () => {
    for (const [path, access] of Object.entries(ROUTE_ACCESS)) {
      if (access.kind === "permission") {
        expect(access.key, `permission sem key: ${path}`).toBeTruthy()
      }
    }
  })
})

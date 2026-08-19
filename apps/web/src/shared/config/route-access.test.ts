import { describe, expect, it } from "vitest"

import { ROUTE_ACCESS } from "./route-access"
import { ROUTES } from "./routes"

describe("ROUTE_ACCESS", () => {
  it("marca home e login como public", () => {
    expect(ROUTE_ACCESS[ROUTES.HOME]).toEqual({ kind: "public" })
    expect(ROUTE_ACCESS[ROUTES.LOGIN]).toEqual({ kind: "public" })
  })

  it("marca início como self", () => {
    expect(ROUTE_ACCESS[ROUTES.INICIO]).toEqual({ kind: "self" })
  })
})

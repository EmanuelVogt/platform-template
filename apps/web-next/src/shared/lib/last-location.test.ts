import { beforeEach, describe, expect, it } from "vitest"

import { ROUTES } from "@/shared/config/routes"

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
})

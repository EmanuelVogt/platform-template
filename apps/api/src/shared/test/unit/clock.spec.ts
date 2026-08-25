import { describe, expect, it } from "vitest"

import { fixedClock } from "./clock"
import { FIXED_NOW } from "./constants"

describe("fixedClock", () => {
  it("sem argumento devolve FIXED_NOW", () => {
    expect(fixedClock().now().toISOString()).toBe(FIXED_NOW)
  })

  it("devolve o instante pedido, igual a cada chamada", () => {
    const clock = fixedClock("2026-06-10T00:00:00.000Z")

    expect(clock.now().toISOString()).toBe("2026-06-10T00:00:00.000Z")
    expect(clock.now().toISOString()).toBe("2026-06-10T00:00:00.000Z")
  })

  it("devolve uma Date nova a cada chamada, para que mutar uma não mova o relógio", () => {
    const clock = fixedClock()
    const first = clock.now()
    first.setFullYear(1999)

    expect(clock.now().toISOString()).toBe(FIXED_NOW)
  })

  it("uma data inválida falha na construção, não na primeira leitura", () => {
    expect(() => fixedClock("ontem")).toThrow("fixedClock: data inválida")
  })
})

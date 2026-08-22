import { CLOCK } from "./clock"
import { SystemClock } from "./system-clock"

import type { Clock } from "./clock"
import { describe, expect, it } from "vitest"

describe("Clock (kernel)", () => {
  it("token é Symbol com descrição estável", () => {
    expect(typeof CLOCK).toBe("symbol")
    expect(CLOCK.description).toBe("Clock")
  })

  it("SystemClock retorna Date", () => {
    const clock: Clock = new SystemClock()
    expect(clock.now()).toBeInstanceOf(Date)
  })
})

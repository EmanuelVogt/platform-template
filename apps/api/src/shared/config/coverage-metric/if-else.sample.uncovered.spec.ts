import { describe, expect, it } from "vitest"

import { pick } from "./if-else.sample"

describe("if-else sample (true path only)", () => {
  it("returns a when flag is true", () => {
    expect(pick(true)).toBe("a")
  })
})

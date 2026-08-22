import { readBar } from "./optional-chain.sample"
import { describe, expect, it } from "vitest"

describe("optional-chain sample", () => {
  it("returns bar when present", () => {
    expect(readBar({ bar: "hi" })).toBe("hi")
  })

  it("returns undefined when absent", () => {
    expect(readBar(null)).toBeUndefined()
    expect(readBar(undefined)).toBeUndefined()
    expect(readBar({})).toBeUndefined()
  })
})

import { describe, expect, it } from "vitest"

import { sessionKeys } from "./session.keys"

describe("sessionKeys", () => {
  it("prefixa current e devices com all", () => {
    expect(sessionKeys.all).toEqual(["session"])
    expect(sessionKeys.current()).toEqual(["session", "current"])
    expect(sessionKeys.devices()).toEqual(["session", "devices"])
  })
})

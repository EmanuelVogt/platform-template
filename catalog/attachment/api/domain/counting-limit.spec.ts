import { Readable, Writable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { describe, expect, it } from "vitest"

import { CountingLimit } from "./counting-limit"

function drain(): Writable {
  return new Writable({
    write(_chunk, _enc, done) {
      done()
    },
  })
}

describe("CountingLimit", () => {
  it("conta os bytes que passam", async () => {
    const limit = new CountingLimit(100)

    await pipeline(Readable.from([Buffer.alloc(30), Buffer.alloc(12)]), limit, drain())

    expect(limit.bytes).toBe(42)
    expect(limit.exceeded).toBe(false)
  })

  it("interrompe o fluxo assim que passa do teto", async () => {
    const limit = new CountingLimit(50)

    await expect(
      pipeline(Readable.from([Buffer.alloc(30), Buffer.alloc(30)]), limit, drain()),
    ).rejects.toThrow()

    expect(limit.exceeded).toBe(true)
  })

  it("aceita exatamente o teto", async () => {
    const limit = new CountingLimit(50)

    await pipeline(Readable.from([Buffer.alloc(50)]), limit, drain())

    expect(limit.exceeded).toBe(false)
  })
})

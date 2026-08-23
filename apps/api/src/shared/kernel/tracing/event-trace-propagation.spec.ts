import { describe, expect, it } from "vitest"

import {
  parseTraceparent,
  remoteSpanContextFromTraceparent,
} from "./event-trace-propagation"

const VALID = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"

describe("parseTraceparent", () => {
  it("parseia um traceparent W3C válido", () => {
    expect(parseTraceparent(VALID)).toEqual({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
    })
  })

  it("retorna null para null ou formato inválido", () => {
    expect(parseTraceparent(null)).toBeNull()
    expect(parseTraceparent("garbage")).toBeNull()
    expect(parseTraceparent("00-onlytwo-parts")).toBeNull()
  })
})

describe("remoteSpanContextFromTraceparent", () => {
  it("monta um SpanContext remoto a partir do traceparent", () => {
    expect(remoteSpanContextFromTraceparent(VALID)).toMatchObject({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
      isRemote: true,
    })
  })

  it("retorna null quando o traceparent está ausente", () => {
    expect(remoteSpanContextFromTraceparent(null)).toBeNull()
  })
})

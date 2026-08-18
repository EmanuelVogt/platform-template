import * as OtelApi from "@opentelemetry/api"
import { SpanStatusCode } from "@opentelemetry/api"

import { Traced } from "./traced.decorator"

const mockSpan = {
  recordException: jest.fn(),
  setStatus: jest.fn(),
  end: jest.fn(),
}

// Mock do tracer global: o @Traced captura `trace.getTracer(...)` no load do
// módulo, então o mock (hoisted pelo jest acima dos imports) é o que ele usa.
jest.mock("@opentelemetry/api", () => {
  const actual = jest.requireActual<typeof OtelApi>("@opentelemetry/api")
  return Object.assign({}, actual, {
    trace: Object.assign({}, actual.trace, {
      getTracer: () => ({
        startActiveSpan: (_name: string, fn: (span: unknown) => unknown) =>
          fn(mockSpan),
      }),
    }),
  })
})

class Subject {
  @Traced({ name: "test.op" })
  async ok(value: string): Promise<string> {
    return Promise.resolve(value)
  }

  @Traced()
  async boom(): Promise<void> {
    await Promise.resolve()
    throw new Error("explodiu")
  }
}

describe("@Traced", () => {
  beforeEach(() => {
    mockSpan.recordException.mockClear()
    mockSpan.setStatus.mockClear()
    mockSpan.end.mockClear()
  })

  it("resolve: retorna o valor e encerra o span sem marcar ERROR", async () => {
    const out = await new Subject().ok("done")
    expect(out).toBe("done")
    expect(mockSpan.recordException).not.toHaveBeenCalled()
    expect(mockSpan.setStatus).not.toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
    })
    expect(mockSpan.end).toHaveBeenCalledTimes(1)
  })

  it("lança: recordException + setStatus ERROR, re-propaga e encerra no finally", async () => {
    await expect(new Subject().boom()).rejects.toThrow("explodiu")
    expect(mockSpan.recordException).toHaveBeenCalledWith(expect.any(Error))
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
    })
    expect(mockSpan.end).toHaveBeenCalledTimes(1)
  })
})

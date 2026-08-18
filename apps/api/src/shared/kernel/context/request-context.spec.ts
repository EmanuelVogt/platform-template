import { RequestContext, type RequestContextStore } from "./request-context"

function makeStore(
  overrides: Partial<RequestContextStore> = {}
): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId: "corr-1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    userId: null,
    sessionId: null,
    deviceId: null,
    access: null,
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
    ...overrides,
  }
}

describe("RequestContext", () => {
  it("guarda e devolve sessionId dentro do escopo", () => {
    const ctx = new RequestContext()
    const result = ctx.run(
      makeStore({ sessionId: "sess-123", userId: "u-1" }),
      () => {
        const store = ctx.get()
        return { sessionId: store.sessionId, userId: store.userId }
      }
    )
    expect(result).toEqual({ sessionId: "sess-123", userId: "u-1" })
  })

  it("tryGet retorna null fora de escopo", () => {
    expect(new RequestContext().tryGet()).toBeNull()
  })

  it("setUserSession escreve null→valor e get reflete", () => {
    const ctx = new RequestContext()
    const result = ctx.run(makeStore(), () => {
      ctx.setUserSession("u-9", "sess-9", "dev-9")
      return ctx.get()
    })
    expect(result.userId).toBe("u-9")
    expect(result.sessionId).toBe("sess-9")
    expect(result.deviceId).toBe("dev-9")
  })

  it("setUserSession com userId divergente lança", () => {
    const ctx = new RequestContext()
    expect(() => {
      ctx.run(makeStore({ userId: "u-1" }), () => {
        ctx.setUserSession("u-2", "sess-x", null)
      })
    }).toThrow(/userId já definido/)
  })

  it("setUserSession fora de escopo lança", () => {
    expect(() => { new RequestContext().setUserSession("u", "s", null) }).toThrow(
      /fora de um escopo/
    )
  })
})

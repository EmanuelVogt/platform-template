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
    actor: null,
    extensions: new Map(),
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

  it("getActor devolve null fora de um escopo de request", () => {
    expect(new RequestContext().getActor()).toBeNull()
  })

  it("getActor devolve null enquanto ninguém chamou setActor", () => {
    const ctx = new RequestContext()
    expect(ctx.run(makeStore(), () => ctx.getActor())).toBeNull()
  })

  it("setActor grava o ator e getActor devolve o mesmo valor no escopo", () => {
    const ctx = new RequestContext()
    const actor = ctx.run(makeStore(), () => {
      ctx.setActor({ id: "a-1", kind: "user", tenantId: "t-1" })
      return ctx.getActor()
    })
    expect(actor).toEqual({ id: "a-1", kind: "user", tenantId: "t-1" })
  })

  it("setActor é one-shot: a segunda chamada lança e preserva o 1º ator", () => {
    const ctx = new RequestContext()
    const store = makeStore()
    ctx.run(store, () => {
      ctx.setActor({ id: "a-1", kind: "user" })
      expect(() => { ctx.setActor({ id: "a-2", kind: "service" }) }).toThrow(
        /actor já definido/
      )
    })
    expect(store.actor).toEqual({ id: "a-1", kind: "user" })
  })

  it("setActor fora de escopo lança", () => {
    expect(() => {
      new RequestContext().setActor({ id: "a-1", kind: "user" })
    }).toThrow(/fora de um escopo/)
  })

  it("setActor propaga o tenantId do ator sem o kernel interpretá-lo", () => {
    const ctx = new RequestContext()
    const tenantId = ctx.run(makeStore({ tenantId: "t-9" }), () => {
      ctx.setActor({ id: "a-1", kind: "user", tenantId: "t-9" })
      return ctx.getActor()?.tenantId
    })
    expect(tenantId).toBe("t-9")
  })

  it("setUserSession deriva o ator com kind user e o tenantId do escopo", () => {
    const ctx = new RequestContext()
    const actor = ctx.run(makeStore({ tenantId: "t-7" }), () => {
      ctx.setUserSession("u-4", "sess-4", null)
      return ctx.getActor()
    })
    expect(actor).toEqual({ id: "u-4", kind: "user", tenantId: "t-7" })
  })

  it("getUserSession lê o ator corrente e devolve nulls fora de escopo", () => {
    const ctx = new RequestContext()
    const inside = ctx.run(makeStore(), () => {
      ctx.setUserSession("u-5", "sess-5", "dev-5")
      return ctx.getUserSession()
    })
    expect(inside).toEqual({
      userId: "u-5",
      sessionId: "sess-5",
      deviceId: "dev-5",
    })
    expect(ctx.getUserSession()).toEqual({
      userId: null,
      sessionId: null,
      deviceId: null,
    })
  })

  it("getExtension devolve undefined para símbolo nunca gravado", () => {
    const ctx = new RequestContext()
    const key = Symbol("identity.permissions")
    expect(ctx.run(makeStore(), () => ctx.getExtension(key))).toBeUndefined()
  })

  it("getExtension fora de escopo devolve undefined", () => {
    expect(new RequestContext().getExtension(Symbol("x"))).toBeUndefined()
  })

  it("setExtension guarda o valor opaco sob o símbolo do módulo dono", () => {
    const ctx = new RequestContext()
    const key = Symbol("identity.permissions")
    const other = Symbol("audit.batch")
    const read = ctx.run(makeStore(), () => {
      ctx.setExtension(key, new Set(["user.read"]))
      return {
        own: ctx.getExtension<ReadonlySet<string>>(key),
        other: ctx.getExtension(other),
      }
    })
    expect(read.own).toEqual(new Set(["user.read"]))
    expect(read.other).toBeUndefined()
  })

  it("extensões ficam isoladas entre requests concorrentes", async () => {
    const ctx = new RequestContext()
    const key = Symbol("identity.permissions")
    const writeThenRead = async (value: string): Promise<string | undefined> => {
      ctx.setExtension(key, value)
      await Promise.resolve()
      return ctx.getExtension<string>(key)
    }
    const [first, second] = await Promise.all([
      ctx.run(makeStore({ requestId: "req-a" }), () => writeThenRead("A")),
      ctx.run(makeStore({ requestId: "req-b" }), () => writeThenRead("B")),
    ])
    expect([first, second]).toEqual(["A", "B"])
  })

  it("setExtension fora de escopo lança", () => {
    expect(() => {
      new RequestContext().setExtension(Symbol("x"), 1)
    }).toThrow(/fora de um escopo/)
  })
})

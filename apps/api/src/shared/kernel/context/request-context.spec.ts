import {
  getActor,
  RequestContext,
  setActor,
  type RequestContextStore,
} from "./request-context"

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
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
    ...overrides,
  }
}

describe("RequestContext", () => {
  it("tryGet retorna null fora de escopo", () => {
    expect(new RequestContext().tryGet()).toBeNull()
  })

  it("getActor devolve null fora de um escopo de request", () => {
    expect(new RequestContext().getActor()).toBeNull()
  })

  it("getActor exportado devolve null fora de um escopo de request", () => {
    expect(getActor()).toBeNull()
  })

  it("getActor exportado enxerga o ator gravado no escopo corrente", () => {
    const ctx = new RequestContext()
    const actor = ctx.run(makeStore(), () => {
      setActor({ id: "a-2", kind: "service" })
      return getActor()
    })
    expect(actor).toEqual({ id: "a-2", kind: "service" })
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

  it("getExtension devolve undefined para símbolo nunca gravado", () => {
    const ctx = new RequestContext()
    const key = Symbol("modulo.permissions")
    expect(ctx.run(makeStore(), () => ctx.getExtension(key))).toBeUndefined()
  })

  it("getExtension fora de escopo devolve undefined", () => {
    expect(new RequestContext().getExtension(Symbol("x"))).toBeUndefined()
  })

  it("setExtension guarda o valor opaco sob o símbolo do módulo dono", () => {
    const ctx = new RequestContext()
    const key = Symbol("modulo.permissions")
    const other = Symbol("outro-modulo.batch")
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
    const key = Symbol("modulo.permissions")
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

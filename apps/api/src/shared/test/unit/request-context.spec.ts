import { describe, expect, it } from "vitest"

import { RequestContext } from "../../kernel/context/request-context"

import { fakeRequestContext } from "./request-context"

describe("fakeRequestContext", () => {
  it("traz os defaults do kernel", () => {
    const store = fakeRequestContext()

    expect(store.correlationId).toBe("c1")
    expect(store.userAgent).toBe("test")
    expect(store.actor).toBeNull()
    expect(store.origin).toBe("http")
    expect(store.tenantId).toBeNull()
    expect(store.locale).toBe("pt-BR")
  })

  it("o parcial sobrescreve só o campo dado", () => {
    const store = fakeRequestContext({
      actor: { id: "a1", kind: "user" },
      tenantId: "t1",
    })

    expect(store.actor).toEqual({ id: "a1", kind: "user" })
    expect(store.tenantId).toBe("t1")
    expect(store.correlationId).toBe("c1")
  })

  it("cada chamada traz o próprio mapa de extensions", () => {
    const key = Symbol("k")
    const first = fakeRequestContext()
    first.extensions.set(key, 1)

    expect(fakeRequestContext().extensions.has(key)).toBe(false)
  })

  it("o store roda dentro do RequestContext do kernel", () => {
    const ctx = new RequestContext()
    const store = fakeRequestContext({ requestId: "r9" })

    expect(ctx.run(store, () => ctx.get().requestId)).toBe("r9")
  })
})

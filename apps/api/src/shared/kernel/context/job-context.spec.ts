import { describe, expect, it } from "vitest"

import { buildJobContextStore } from "./job-context"
import { RequestContext } from "./request-context"

describe("buildJobContextStore", () => {
  it("abre um contexto de job sem ator quando nada foi enfileirado", () => {
    const store = buildJobContextStore()
    expect(store.origin).toBe("job")
    expect(store.actor).toBeNull()
    expect(store.tenantId).toBeNull()
    expect(store.correlationId).toBe(store.requestId)
  })

  it("copia o actorId enfileirado para o ator do contexto", () => {
    const store = buildJobContextStore({ actorId: "a-1" })
    expect(store.actor).toEqual({ id: "a-1", kind: "job" })
  })

  it("preserva a correlação persistida pelo job", () => {
    const store = buildJobContextStore({ correlationId: "corr-77" })
    expect(store.correlationId).toBe("corr-77")
    expect(store.requestId).not.toBe("corr-77")
  })

  it("propaga o tenantId recebido para o store e para o ator", () => {
    const store = buildJobContextStore({ actorId: "a-1", tenantId: "t-1" })
    expect(store.tenantId).toBe("t-1")
    expect(store.actor).toEqual({ id: "a-1", kind: "job", tenantId: "t-1" })
  })

  it("tenantId e ator chegam intactos ao escopo rodado pelo dispatcher", () => {
    const ctx = new RequestContext()
    const seen = ctx.run(
      buildJobContextStore({ actorId: "a-2", tenantId: "t-2" }),
      () => ({ tenantId: ctx.get().tenantId, actor: ctx.getActor() })
    )
    expect(seen).toEqual({
      tenantId: "t-2",
      actor: { id: "a-2", kind: "job", tenantId: "t-2" },
    })
  })

  it("cada job recebe uma sacola de extensões própria", () => {
    const ctx = new RequestContext()
    const key = Symbol("audit.batch")
    ctx.run(buildJobContextStore(), () => { ctx.setExtension(key, "lote-1") })
    expect(ctx.run(buildJobContextStore(), () => ctx.getExtension(key))).toBeUndefined()
  })
})

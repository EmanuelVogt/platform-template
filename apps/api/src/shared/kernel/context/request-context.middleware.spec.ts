import { ulid } from "ulid"
import { describe, expect, it } from "vitest"

import { RequestContext } from "./request-context"
import { createRequestContextMiddleware } from "./request-context.middleware"

import type { RequestContextStore } from "./request-context"
import type { Request, Response } from "express"

function runWith(correlationHeader: string | undefined): RequestContextStore {
  const ctx = new RequestContext()
  const mw = createRequestContextMiddleware(ctx)
  // Coletor: o middleware chama next síncrono; result[0] é o store do escopo.
  const result: RequestContextStore[] = []
  const req = {
    headers: { "x-correlation-id": correlationHeader },
    ip: "1.2.3.4",
  } as unknown as Request
  mw(req, {} as Response, () => {
    result.push(ctx.get())
  })
  return result[0]!
}

function runWithReq(
  headers: Record<string, string | string[] | undefined>,
  ip: string | undefined
): RequestContextStore {
  const ctx = new RequestContext()
  const mw = createRequestContextMiddleware(ctx)
  const result: RequestContextStore[] = []
  const req = { headers, ip } as unknown as Request
  mw(req, {} as Response, () => {
    result.push(ctx.get())
  })
  return result[0]!
}

describe("requestContextMiddleware — correlationId", () => {
  it("adota ULID válido (uppercase)", () => {
    const id = ulid()
    const store = runWith(id)
    expect(store.correlationId).toBe(id.toUpperCase())
  })

  it("normaliza ULID lowercase para uppercase", () => {
    const id = ulid()
    const store = runWith(id.toLowerCase())
    expect(store.correlationId).toBe(id.toUpperCase())
  })

  it("ignora valor forjado e usa o requestId gerado", () => {
    for (const forged of ["../../etc/passwd", "a\nb", "foo"]) {
      const store = runWith(forged)
      expect(store.correlationId).toBe(store.requestId)
      expect(store.correlationId).not.toBe(forged)
    }
  })

  it("sem header usa o requestId gerado", () => {
    const store = runWith(undefined)
    expect(store.correlationId).toBe(store.requestId)
  })

  it("cabeçalho array-valued usa o primeiro valor, não um valor qualquer", () => {
    const first = ulid()
    const second = ulid()
    const store = runWithReq({ "x-correlation-id": [first, second] }, "1.2.3.4")
    expect(store.correlationId).toBe(first.toUpperCase())
  })

  it("cabeçalho array-valued vazio cai no requestId gerado", () => {
    const store = runWithReq({ "x-correlation-id": [] }, "1.2.3.4")
    expect(store.correlationId).toBe(store.requestId)
  })
})

describe("requestContextMiddleware — demais campos do store", () => {
  it("sem Accept-Language usa pt-BR; com o header, usa o valor enviado", () => {
    const semHeader = runWithReq({}, "1.2.3.4")
    expect(semHeader.locale).toBe("pt-BR")

    const comHeader = runWithReq({ "accept-language": "en-US" }, "1.2.3.4")
    expect(comHeader.locale).toBe("en-US")
  })

  it("sem req.ip grava ip nulo no store", () => {
    const store = runWithReq({}, undefined)
    expect(store.ip).toBeNull()
  })
})

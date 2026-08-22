import { firstValueFrom, of } from "rxjs"

import { buildJobContextStore } from "../context/job-context"
import {
  RequestContext,
  type RequestContextStore,
} from "../context/request-context"

import { IdempotencyInterceptor } from "./idempotency.interceptor"

import type {
  IdempotencyRepository,
  ReserveInput,
} from "./idempotency.repository"
import type { CallHandler, ExecutionContext } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import { describe, expect, it, vi } from "vitest"

function makeStore(tenantId: string | null = null): RequestContextStore {
  return { ...buildJobContextStore({ tenantId }), origin: "http" }
}

function makeExecutionContext(): ExecutionContext {
  const request = {
    method: "POST",
    originalUrl: "/v1/things?page=2",
    body: { b: 1, a: 2 },
    headers: { "idempotency-key": "k-1" },
  }
  const response = { statusCode: 201, status: vi.fn() }
  return {
    getType: () => "http",
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext
}

function makeInterceptor(): {
  interceptor: IdempotencyInterceptor
  ctx: RequestContext
  reserved: ReserveInput[]
} {
  const reserved: ReserveInput[] = []
  const repo = {
    tryReserve: (input: ReserveInput) => {
      reserved.push(input)
      return Promise.resolve(null)
    },
    complete: () => Promise.resolve(),
  } as unknown as IdempotencyRepository
  const reflector = {
    get: () => ({ ttlHours: 24 }),
  } as unknown as Reflector
  const ctx = new RequestContext()
  return {
    interceptor: new IdempotencyInterceptor(reflector, repo, ctx),
    ctx,
    reserved,
  }
}

const next = { handle: () => of({ ok: true }) } as CallHandler

describe("IdempotencyInterceptor — escopo da chave", () => {
  it("compõe o escopo com tenantId e actorId do contexto", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore("t-1"), async () => {
      ctx.setActor({ id: "a-1", kind: "user", tenantId: "t-1" })
      await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    })
    expect(reserved[0]?.scope).toBe("t-1:a-1")
  })

  it("usa o placeholder quando não há ator no contexto", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore("t-1"), async () => {
      await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    })
    expect(reserved[0]?.scope).toBe("t-1:_")
  })

  it("isola o escopo por ator dentro do mesmo tenant", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    for (const actorId of ["a-1", "a-2"]) {
      await ctx.run(makeStore("t-1"), async () => {
        ctx.setActor({ id: actorId, kind: "user" })
        await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
      })
    }
    expect(reserved.map((r) => r.scope)).toEqual(["t-1:a-1", "t-1:a-2"])
  })

  it("sem tenant e sem ator o escopo cai nos dois placeholders", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore(), async () => {
      await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    })
    expect(reserved[0]?.scope).toBe("_:_")
  })
})

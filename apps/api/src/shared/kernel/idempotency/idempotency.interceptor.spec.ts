import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  type HttpException,
} from "@nestjs/common"
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
import type { Reflector } from "@nestjs/core"

function makeStore(tenantId: string | null = null): RequestContextStore {
  return { ...buildJobContextStore({ tenantId }), origin: "http" }
}

function makeExecutionContext(
  overrides: { key?: string; ip?: string } = {}
): ExecutionContext {
  const request = {
    method: "POST",
    originalUrl: "/v1/things?page=2",
    body: { b: 1, a: 2 },
    headers: { "idempotency-key": overrides.key ?? "k-1" },
    ip: overrides.ip,
  }
  const response = { statusCode: 201, status: jest.fn() }
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

  it("escopa por IP quando não há ator no contexto", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore("t-1"), async () => {
      await firstValueFrom(
        interceptor.intercept(makeExecutionContext({ ip: "203.0.113.7" }), next)
      )
    })
    expect(reserved[0]?.scope).toBe("t-1:ip:203.0.113.7")
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

  it("sem tenant, sem ator e sem IP conhecido restam os placeholders", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore(), async () => {
      await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    })
    expect(reserved[0]?.scope).toBe("_:ip:_")
  })

  it("dois anônimos de IPs diferentes não colidem (REM-32)", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    for (const ip of ["203.0.113.7", "198.51.100.4"]) {
      await ctx.run(makeStore("t-1"), async () => {
        await firstValueFrom(
          interceptor.intercept(makeExecutionContext({ ip }), next)
        )
      })
    }
    expect(reserved.map((r) => r.scope)).toEqual([
      "t-1:ip:203.0.113.7",
      "t-1:ip:198.51.100.4",
    ])
  })

  it("dois anônimos do mesmo IP compartilham o escopo (dedup preservado)", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    for (let i = 0; i < 2; i++) {
      await ctx.run(makeStore("t-1"), async () => {
        await firstValueFrom(
          interceptor.intercept(
            makeExecutionContext({ ip: "203.0.113.7" }),
            next
          )
        )
      })
    }
    expect(reserved.map((r) => r.scope)).toEqual([
      "t-1:ip:203.0.113.7",
      "t-1:ip:203.0.113.7",
    ])
  })
})

describe("IdempotencyInterceptor — formato da chave (REM-32)", () => {
  function attempt(key: string): { error: unknown; reservations: number } {
    const { interceptor, reserved } = makeInterceptor()
    let error: unknown = null
    try {
      interceptor.intercept(makeExecutionContext({ key }), next)
    } catch (err) {
      error = err
    }
    return { error, reservations: reserved.length }
  }

  it("aceita chave dentro do padrão e chega ao store", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore("t-1"), async () => {
      await firstValueFrom(
        interceptor.intercept(makeExecutionContext({ key: "abc_XYZ-09" }), next)
      )
    })
    expect(reserved[0]?.key).toBe("abc_XYZ-09")
  })

  it("aceita exatamente 200 caracteres", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore("t-1"), async () => {
      await firstValueFrom(
        interceptor.intercept(
          makeExecutionContext({ key: "a".repeat(200) }),
          next
        )
      )
    })
    expect(reserved[0]?.key).toHaveLength(200)
  })

  it("rejeita 201 caracteres com 400, sem consultar o store", () => {
    const { error, reservations } = attempt("a".repeat(201))
    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as HttpException).getStatus()).toBe(400)
    expect(reservations).toBe(0)
  })

  it("rejeita chave com `/` com 400, sem consultar o store", () => {
    const { error, reservations } = attempt("path/traversal")
    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as HttpException).getStatus()).toBe(400)
    expect(reservations).toBe(0)
  })
})

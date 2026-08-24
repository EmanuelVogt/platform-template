import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  HttpException,
  UnprocessableEntityException,
} from "@nestjs/common"
import { firstValueFrom, of, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildJobContextStore } from "../context/job-context"
import {
  RequestContext,
  type RequestContextStore,
} from "../context/request-context"

import { IdempotencyInterceptor } from "./idempotency.interceptor"

import type {
  IdempotencyRepository,
  IdempotencyStatus,
  ReserveInput,
} from "./idempotency.repository"
import type { IdempotencyRow } from "./idempotency.table"
import type { IdempotentOptions } from "./idempotent.decorator"
import type { Reflector } from "@nestjs/core"

type ResponseStub = {
  statusCode: number
  status: ReturnType<typeof vi.fn>
}

type ContextOverrides = {
  method?: string
  originalUrl?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
  key?: string
  ip?: string
  type?: string
  response?: ResponseStub
}

type CompleteCall = {
  scope: string
  key: string
  status: IdempotencyStatus
  responseStatus: number
  responseBody: unknown
}

type InterceptorOptions = {
  /** `null` = a rota não está anotada com `@Idempotent`. */
  metadata?: IdempotentOptions | null
  /** Row já gravada para a chave; o que não for dito casa com a reserva. */
  existing?: Partial<IdempotencyRow> | null
  reopened?: boolean
}

function makeStore(tenantId: string | null = null): RequestContextStore {
  return { ...buildJobContextStore({ tenantId }), origin: "http" }
}

function makeResponse(statusCode = 201): ResponseStub {
  return { statusCode, status: vi.fn() }
}

function makeExecutionContext(
  overrides: ContextOverrides = {}
): ExecutionContext {
  const request = {
    method: overrides.method ?? "POST",
    originalUrl: overrides.originalUrl ?? "/v1/things?page=2",
    body: overrides.body ?? { b: 1, a: 2 },
    headers: overrides.headers ?? {
      "idempotency-key": overrides.key ?? "k-1",
    },
    ip: overrides.ip,
  }
  const response = overrides.response ?? makeResponse()
  return {
    getType: () => overrides.type ?? "http",
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext
}

function makeInterceptor(options: InterceptorOptions = {}): {
  interceptor: IdempotencyInterceptor
  ctx: RequestContext
  reserved: ReserveInput[]
  completed: CompleteCall[]
  reopenCalls: { scope: string; key: string }[]
} {
  const reserved: ReserveInput[] = []
  const completed: CompleteCall[] = []
  const reopenCalls: { scope: string; key: string }[] = []
  const repo = {
    tryReserve: (input: ReserveInput) => {
      reserved.push(input)
      const conflict = options.existing
        ? { ...rowFor(input), ...options.existing }
        : null
      return Promise.resolve(conflict)
    },
    reopen: (scope: string, key: string) => {
      reopenCalls.push({ scope, key })
      return Promise.resolve(options.reopened ?? false)
    },
    complete: (
      scope: string,
      key: string,
      status: IdempotencyStatus,
      responseStatus: number,
      responseBody: unknown
    ) => {
      completed.push({ scope, key, status, responseStatus, responseBody })
      return Promise.resolve()
    },
  } as unknown as IdempotencyRepository
  const metadata =
    options.metadata === undefined ? { ttlHours: 24 } : options.metadata
  const reflector = {
    get: () => metadata ?? undefined,
  } as unknown as Reflector
  const ctx = new RequestContext()
  return {
    interceptor: new IdempotencyInterceptor(reflector, repo, ctx),
    ctx,
    reserved,
    completed,
    reopenCalls,
  }
}

function rowFor(input: ReserveInput): IdempotencyRow {
  return {
    scope: input.scope,
    key: input.key,
    endpoint: input.endpoint,
    requestHash: input.requestHash,
    status: "completed",
    responseStatus: 200,
    responseBody: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: input.expiresAt,
  }
}

function firstReserve(reserved: ReserveInput[]): ReserveInput {
  const input = reserved[0]
  if (!input) {
    throw new Error("tryReserve não foi chamado")
  }
  return input
}

function firstComplete(completed: CompleteCall[]): CompleteCall {
  const call = completed[0]
  if (!call) {
    throw new Error("complete não foi chamado")
  }
  return call
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error) {
    return error
  }
  return null
}

async function hashOf(overrides: ContextOverrides): Promise<string> {
  const { interceptor, reserved } = makeInterceptor()
  await firstValueFrom(
    interceptor.intercept(makeExecutionContext(overrides), next)
  )
  return firstReserve(reserved).requestHash
}

const next = { handle: () => of({ ok: true }) } as CallHandler

function failingHandler(error: unknown): CallHandler {
  return { handle: () => throwError(() => error) } as CallHandler
}

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

  it("sem ator e sem IP conhecido resta o placeholder do IP", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore("t-1"), async () => {
      await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    })
    expect(reserved[0]?.scope).toBe("t-1:ip:_")
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

  it("isola o escopo por ator dentro do mesmo tenant", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    for (const actorId of ["a-1", "a-2"]) {
      await ctx.run(makeStore("t-1"), async () => {
        ctx.setActor({ id: actorId, kind: "user" })
        await firstValueFrom(
          interceptor.intercept(makeExecutionContext(), next)
        )
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

  it("usa só o ator quando o contexto não tem tenant", async () => {
    const { interceptor, ctx, reserved } = makeInterceptor()
    await ctx.run(makeStore(), async () => {
      ctx.setActor({ id: "a-1", kind: "user" })
      await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    })
    expect(firstReserve(reserved).scope).toBe("_:a-1")
  })

  it("fora de um escopo de request o escopo usa os placeholders", async () => {
    const { interceptor, reserved } = makeInterceptor()
    await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    expect(firstReserve(reserved).scope).toBe("_:ip:_")
  })
})

describe("IdempotencyInterceptor — quando não há o que deduplicar", () => {
  it("sem metadata @Idempotent devolve o valor do handler sem reservar", async () => {
    const { interceptor, reserved } = makeInterceptor({ metadata: null })
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext(), next)
    )
    expect(result).toEqual({ ok: true })
    expect(reserved).toEqual([])
  })

  it("fora de um contexto http devolve o valor do handler sem reservar", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext({ type: "rpc" }), next)
    )
    expect(result).toEqual({ ok: true })
    expect(reserved).toEqual([])
  })

  it("sem o header Idempotency-Key o handler executa sem dedup", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext({ headers: {} }), next)
    )
    expect(result).toEqual({ ok: true })
    expect(reserved).toEqual([])
  })

  it("com o header repetido e vazio o handler executa sem dedup", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const context = makeExecutionContext({
      headers: { "idempotency-key": [] },
    })
    const result = await firstValueFrom(interceptor.intercept(context, next))
    expect(result).toEqual({ ok: true })
    expect(reserved).toEqual([])
  })
})

describe("IdempotencyInterceptor — leitura do header", () => {
  it("usa o primeiro valor quando o header chega repetido", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const context = makeExecutionContext({
      headers: { "idempotency-key": ["k-a", "k-b"] },
    })
    await firstValueFrom(interceptor.intercept(context, next))
    expect(firstReserve(reserved).key).toBe("k-a")
  })

  it("usa o valor cru quando o header chega como string", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const context = makeExecutionContext({
      headers: { "idempotency-key": "k-1" },
    })
    await firstValueFrom(interceptor.intercept(context, next))
    expect(firstReserve(reserved).key).toBe("k-1")
  })
})

describe("IdempotencyInterceptor — reserva sem conflito", () => {
  it("executa o handler e devolve o valor dele intacto", async () => {
    const { interceptor } = makeInterceptor()
    const handler = { handle: () => of({ id: "x-1", total: 7 }) } as CallHandler
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext(), handler)
    )
    expect(result).toEqual({ id: "x-1", total: 7 })
  })

  it("grava o snapshot com o status da resposta e o corpo devolvido", async () => {
    const { interceptor, completed } = makeInterceptor()
    const context = makeExecutionContext({ response: makeResponse(201) })
    await firstValueFrom(interceptor.intercept(context, next))
    expect(firstComplete(completed)).toEqual({
      scope: "_:ip:_",
      key: "k-1",
      status: "completed",
      responseStatus: 201,
      responseBody: { ok: true },
    })
  })
})

describe("IdempotencyInterceptor — conflito na reserva", () => {
  it("rejeita com 422 a mesma chave com payload diferente", async () => {
    const { interceptor } = makeInterceptor({
      existing: { requestHash: "hash-de-outro-payload" },
    })
    const error = await captureError(() =>
      firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    )
    expect(error).toBeInstanceOf(UnprocessableEntityException)
    expect((error as HttpException).message).toBe(
      "Idempotency-Key reusada com payload diferente"
    )
  })

  it("rejeita com 409 a chave ainda em processamento", async () => {
    const { interceptor, completed } = makeInterceptor({
      existing: { status: "in_progress" },
    })
    const error = await captureError(() =>
      firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    )
    expect(error).toBeInstanceOf(ConflictException)
    expect((error as HttpException).message).toBe(
      "Requisição ainda em processamento, tente novamente"
    )
    expect(completed).toEqual([])
  })

  it("faz replay do corpo persistido e reaplica o status gravado", async () => {
    const response = makeResponse(201)
    const { interceptor, completed } = makeInterceptor({
      existing: {
        status: "completed",
        responseStatus: 202,
        responseBody: { id: "original" },
      },
    })
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext({ response }), next)
    )
    expect(result).toEqual({ id: "original" })
    expect(response.status).toHaveBeenCalledWith(202)
    expect(completed).toEqual([])
  })

  it("faz replay com 200 quando não há status persistido", async () => {
    const response = makeResponse(201)
    const { interceptor } = makeInterceptor({
      existing: {
        status: "completed",
        responseStatus: null,
        responseBody: { id: "original" },
      },
    })
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext({ response }), next)
    )
    expect(result).toEqual({ id: "original" })
    expect(response.status).toHaveBeenCalledWith(200)
  })

  it("re-lança o erro persistido com o mesmo corpo e status", async () => {
    const { interceptor } = makeInterceptor({
      existing: {
        status: "completed",
        responseStatus: 422,
        responseBody: { title: "Saldo insuficiente" },
      },
    })
    const error = await captureError(() =>
      firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    )
    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(422)
    expect((error as HttpException).getResponse()).toEqual({
      title: "Saldo insuficiente",
    })
  })

  it("re-lança o erro persistido sem corpo com o texto padrão", async () => {
    const { interceptor } = makeInterceptor({
      existing: {
        status: "completed",
        responseStatus: 500,
        responseBody: null,
      },
    })
    const error = await captureError(() =>
      firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    )
    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(500)
    expect((error as HttpException).getResponse()).toBe("Erro")
  })

  it("reabre a row 'failed' e re-executa o handler", async () => {
    const { interceptor, completed, reopenCalls } = makeInterceptor({
      existing: { status: "failed" },
      reopened: true,
    })
    const result = await firstValueFrom(
      interceptor.intercept(makeExecutionContext(), next)
    )
    expect(result).toEqual({ ok: true })
    expect(reopenCalls).toEqual([{ scope: "_:ip:_", key: "k-1" }])
    expect(firstComplete(completed).status).toBe("completed")
  })

  it("devolve 409 quando perde a corrida pela reabertura", async () => {
    const { interceptor, completed } = makeInterceptor({
      existing: { status: "failed" },
      reopened: false,
    })
    const error = await captureError(() =>
      firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    )
    expect(error).toBeInstanceOf(ConflictException)
    expect((error as HttpException).message).toBe(
      "Requisição ainda em processamento, tente novamente"
    )
    expect(completed).toEqual([])
  })
})

describe("IdempotencyInterceptor — falha do handler", () => {
  it("grava erro http abaixo de 500 como completed com o corpo do erro", async () => {
    const { interceptor, completed } = makeInterceptor()
    const thrown = new UnprocessableEntityException("Saldo insuficiente")
    const error = await captureError(() =>
      firstValueFrom(
        interceptor.intercept(makeExecutionContext(), failingHandler(thrown))
      )
    )
    expect(error).toBe(thrown)
    expect(firstComplete(completed)).toEqual({
      scope: "_:ip:_",
      key: "k-1",
      status: "completed",
      responseStatus: 422,
      responseBody: thrown.getResponse(),
    })
  })

  it("grava erro http de 500 ou mais como failed e sem corpo", async () => {
    const { interceptor, completed } = makeInterceptor()
    const thrown = new HttpException("Indisponível", 503)
    const error = await captureError(() =>
      firstValueFrom(
        interceptor.intercept(makeExecutionContext(), failingHandler(thrown))
      )
    )
    expect(error).toBe(thrown)
    expect(firstComplete(completed)).toEqual({
      scope: "_:ip:_",
      key: "k-1",
      status: "failed",
      responseStatus: 503,
      responseBody: null,
    })
  })

  it("grava erro que não é HttpException como failed com status 500", async () => {
    const { interceptor, completed } = makeInterceptor()
    const thrown = new Error("conexão caiu")
    const error = await captureError(() =>
      firstValueFrom(
        interceptor.intercept(makeExecutionContext(), failingHandler(thrown))
      )
    )
    expect(error).toBe(thrown)
    expect(firstComplete(completed)).toEqual({
      scope: "_:ip:_",
      key: "k-1",
      status: "failed",
      responseStatus: 500,
      responseBody: null,
    })
  })
})

describe("IdempotencyInterceptor — hash do payload", () => {
  it("ignora a ordem das chaves, inclusive em objeto aninhado e array", async () => {
    const first = await hashOf({
      body: { a: 1, nested: { d: 4, c: 3 }, list: [{ g: 7, f: 6 }] },
    })
    const second = await hashOf({
      body: { list: [{ f: 6, g: 7 }], nested: { c: 3, d: 4 }, a: 1 },
    })
    expect(second).toBe(first)
  })

  it("muda quando o conteúdo do payload muda", async () => {
    const first = await hashOf({ body: { a: 1 } })
    const second = await hashOf({ body: { a: 2 } })
    expect(second).not.toBe(first)
  })

  it("não leva a query string em conta", async () => {
    const first = await hashOf({ originalUrl: "/v1/things?page=2" })
    const second = await hashOf({ originalUrl: "/v1/things?page=3" })
    const third = await hashOf({ originalUrl: "/v1/things" })
    expect(second).toBe(first)
    expect(third).toBe(first)
  })
})

describe("IdempotencyInterceptor — endpoint reservado", () => {
  it("descarta a query string do endpoint reservado", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const context = makeExecutionContext({
      method: "POST",
      originalUrl: "/v1/things?page=2&q=x",
    })
    await firstValueFrom(interceptor.intercept(context, next))
    expect(firstReserve(reserved).endpoint).toBe("POST /v1/things")
  })

  it("preserva a url inteira quando não há query string", async () => {
    const { interceptor, reserved } = makeInterceptor()
    const context = makeExecutionContext({
      method: "PUT",
      originalUrl: "/v1/things/42",
    })
    await firstValueFrom(interceptor.intercept(context, next))
    expect(firstReserve(reserved).endpoint).toBe("PUT /v1/things/42")
  })
})

describe("IdempotencyInterceptor — validade da reserva", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("deriva expiresAt do ttlHours a partir do instante da reserva", async () => {
    const { interceptor, reserved } = makeInterceptor({
      metadata: { ttlHours: 6 },
    })
    await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    expect(firstReserve(reserved).expiresAt.toISOString()).toBe(
      "2026-03-10T18:00:00.000Z"
    )
  })

  it("um ttl maior empurra expiresAt na mesma proporção", async () => {
    const { interceptor, reserved } = makeInterceptor({
      metadata: { ttlHours: 24 },
    })
    await firstValueFrom(interceptor.intercept(makeExecutionContext(), next))
    expect(firstReserve(reserved).expiresAt.toISOString()).toBe(
      "2026-03-11T12:00:00.000Z"
    )
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

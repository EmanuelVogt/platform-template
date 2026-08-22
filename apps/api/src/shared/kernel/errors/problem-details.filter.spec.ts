import { type ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common"
import pino from "pino"

import { RequestContext } from "../context/request-context"
import { LoggerFactory } from "../logging/logger.factory"

import { DomainError } from "./domain.error"
import { ForbiddenError } from "./forbidden.error"
import { PoolSaturatedError } from "./pool-saturated.error"
import { ProblemDetailsFilter } from "./problem-details.filter"

import type { RequestContextStore } from "../context/request-context"
import { describe, expect, it } from "vitest"

function makeHost(captured: {
  status?: number
  contentType?: string
  headers: Record<string, string>
  body?: unknown
}): ArgumentsHost {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    type(value: string) {
      captured.contentType = value
      return res
    },
    json(payload: unknown) {
      captured.body = payload
      return res
    },
    header(name: string, value: string) {
      captured.headers[name] = value
      return res
    },
  }
  const req = { originalUrl: "/v1/auth/login" }
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost
}

describe("ProblemDetailsFilter — 429", () => {
  it("adiciona Retry-After ao mapear 429", () => {
    const ctx = new RequestContext()
    const factory = new LoggerFactory(ctx, pino({ level: "silent" }))
    const filter = new ProblemDetailsFilter(factory, ctx)
    const captured: {
      status?: number
      headers: Record<string, string>
      body?: unknown
    } = { headers: {} }

    filter.catch(
      new HttpException("Too Many Requests", HttpStatus.TOO_MANY_REQUESTS),
      makeHost(captured)
    )

    expect(captured.status).toBe(429)
    expect(captured.headers["Retry-After"]).toBeDefined()
  })
})

class FakeRateLimitedError extends DomainError {
  readonly status = 429
  readonly type = "https://errors.example.com/rate-limited"
  override readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super("Muitas tentativas")
    this.retryAfterSeconds = retryAfterSeconds
  }
}

class FakeNotFoundError extends DomainError {
  readonly status = 404
  readonly type = "https://errors.example.com/not-found"
  constructor() {
    super("Recurso não encontrado")
  }
}

class FakeUnprocessableError extends DomainError {
  readonly status = 422
  readonly type = "https://errors.example.com/unprocessable"
  constructor() {
    super("Entrada inválida")
  }
}

class FakeInternalError extends DomainError {
  readonly status = 500
  readonly type = "x"
}

type Captured = {
  status?: number
  contentType?: string
  headers: Record<string, string>
  body?: unknown
}

function run(exception: unknown, correlationId?: string): Captured {
  const ctx = new RequestContext()
  const factory = new LoggerFactory(ctx, pino({ level: "silent" }))
  const filter = new ProblemDetailsFilter(factory, ctx)
  const captured: Captured = { headers: {} }
  const emit = (): void => {
    filter.catch(exception, makeHost(captured))
  }
  if (correlationId === undefined) {
    emit()
    return captured
  }
  ctx.run(makeStore(correlationId), emit)
  return captured
}

function makeStore(correlationId: string): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId,
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
  }
}

describe("ProblemDetailsFilter — Retry-After por origem", () => {
  it("DomainError 429 → Retry-After do retryAfterSeconds", () => {
    const r = run(new FakeRateLimitedError(30))
    expect(r.status).toBe(429)
    expect(r.headers["Retry-After"]).toBe("30")
  })

  it("HttpException com retryAfter → usa esse valor", () => {
    const r = run(new HttpException({ message: "rate", retryAfter: 45 }, 429))
    expect(r.headers["Retry-After"]).toBe("45")
  })

  it("429 sem número → fallback 60", () => {
    const r = run(new HttpException("Too Many Requests", 429))
    expect(r.headers["Retry-After"]).toBe("60")
  })
})

describe("ProblemDetailsFilter — 503 de saturação do pool", () => {
  it("PoolSaturatedError → 503 com Retry-After 1", () => {
    const r = run(new PoolSaturatedError())
    expect(r.status).toBe(503)
    expect(r.headers["Retry-After"]).toBe("1")
    expect(r.contentType).toBe("application/problem+json")
  })

  it("corpo é RFC 7807 exato, com correlationId e sem nada interno", () => {
    const r = run(new PoolSaturatedError(), "corr-503")
    expect(r.body).toEqual({
      type: "https://errors.example.com/service-unavailable",
      title: "Serviço temporariamente indisponível",
      status: 503,
      detail: "Serviço temporariamente indisponível",
      instance: "/v1/auth/login",
      correlationId: "corr-503",
    })
    const json = JSON.stringify(r.body)
    for (const leak of [
      "postgres://",
      "timeout exceeded",
      "totalCount",
      "idleCount",
      "waitingCount",
      "select",
      "/Users",
      "at Object",
      "localhost",
    ]) {
      expect(json).not.toContain(leak)
    }
  })

  it("503 mantém a precedência: domain 1 / http 45 / default 60", () => {
    expect(run(new PoolSaturatedError()).headers["Retry-After"]).toBe("1")
    expect(
      run(new HttpException({ message: "indisponível", retryAfter: 45 }, 503))
        .headers["Retry-After"]
    ).toBe("45")
    expect(
      run(new HttpException("Service Unavailable", 503)).headers["Retry-After"]
    ).toBe("60")
  })

  it("outros status seguem sem Retry-After", () => {
    expect(run(new ForbiddenError()).headers["Retry-After"]).toBeUndefined()
    expect(run(new Error("boom")).headers["Retry-After"]).toBeUndefined()
  })
})

describe("ProblemDetailsFilter — não-vazamento", () => {
  it("erro genérico vira 500 'Erro interno' sem detail/SQL/path/stack", () => {
    const r = run(
      new Error("select * from users; at Object.<anonymous> /home/emanuel/x")
    )
    expect(r.status).toBe(500)
    const body = r.body as Record<string, unknown>
    expect(body.title).toBe("Erro interno")
    expect(body).not.toHaveProperty("detail")
    const json = JSON.stringify(body)
    expect(json).not.toContain("select")
    expect(json).not.toContain("/home/emanuel")
    expect(json).not.toContain("at Object")
  })

  it("DomainError mapeia status/type/title", () => {
    const r = run(new FakeInternalError("Falha de domínio"))
    const body = r.body as Record<string, unknown>
    expect(r.status).toBe(500)
    expect(body.type).toBe("x")
    expect(body.title).toBe("Falha de domínio")
  })
})

class FakeLinkedError extends DomainError {
  readonly status = 409
  readonly type = "https://errors.example.com/fake-linked"
  override readonly extensions = {
    programs: [{ id: "01A", name: "Programa X" }],
    // tentativa de clobber: membro padrão deve vencer
    status: 500,
  }
  constructor() {
    super("Vinculado a programas")
  }
}

describe("ProblemDetailsFilter — extensões RFC 7807", () => {
  it("espalha extensions do DomainError sem clobber dos membros padrão", () => {
    const r = run(new FakeLinkedError())
    const body = r.body as Record<string, unknown>
    expect(body.programs).toEqual([{ id: "01A", name: "Programa X" }])
    expect(r.status).toBe(409)
    expect(body.status).toBe(409)
  })

  it("DomainError sem extensions segue com corpo padrão", () => {
    const r = run(new FakeInternalError("Falha de domínio"))
    const body = r.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(
      ["correlationId", "detail", "instance", "status", "title", "type"].sort()
    )
  })
})

describe("ProblemDetailsFilter — mapeamento por classe DomainError", () => {
  const cases = [
    { name: "FakeUnprocessableError", err: new FakeUnprocessableError(), status: 422 },
    { name: "FakeNotFoundError", err: new FakeNotFoundError(), status: 404 },
    { name: "PoolSaturatedError", err: new PoolSaturatedError(), status: 503 },
    { name: "ForbiddenError", err: new ForbiddenError(), status: 403 },
    { name: "FakeRateLimitedError", err: new FakeRateLimitedError(30), status: 429 },
  ]

  it.each(cases)("$name → status $status, type e title presentes", ({ err, status }) => {
    const r = run(err)
    const body = r.body as Record<string, unknown>
    expect(r.status).toBe(status)
    expect(body.status).toBe(status)
    expect(typeof body.type).toBe("string")
    expect(typeof body.title).toBe("string")
  })
})

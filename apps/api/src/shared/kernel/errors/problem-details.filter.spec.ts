import { type ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common"
import { ZodValidationException } from "nestjs-zod"
import pino from "pino"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { RequestContext } from "../context/request-context"
import { LoggerFactory } from "../logging/logger.factory"

import { DomainError } from "./domain.error"
import { ForbiddenError } from "./forbidden.error"
import { PoolSaturatedError } from "./pool-saturated.error"
import { ProblemDetailsFilter } from "./problem-details.filter"

import type { RequestContextStore } from "../context/request-context"

function makeHost(
  captured: {
    status?: number
    contentType?: string
    headers: Record<string, string>
    body?: unknown
  },
  url = "/v1/auth/login"
): ArgumentsHost {
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
  const req = { originalUrl: url }
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
    expect(captured.headers["Retry-After"]).toBe("60")
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

type LoggedError = { event: string; fields: unknown }

type RunOptions = {
  correlationId?: string
  url?: string
}

function runWith(
  exception: unknown,
  options: RunOptions = {}
): Captured & { logged: LoggedError[] } {
  const logged: LoggedError[] = []
  const ctx = new RequestContext()
  const factory = {
    forModule: () => ({
      error: (event: string, fields: unknown) => {
        logged.push({ event, fields })
      },
    }),
  } as unknown as LoggerFactory
  const filter = new ProblemDetailsFilter(factory, ctx)
  const captured: Captured = { headers: {} }
  const emit = (): void => {
    filter.catch(exception, makeHost(captured, options.url))
  }
  if (options.correlationId === undefined) {
    emit()
  } else {
    ctx.run(makeStore(options.correlationId), emit)
  }
  return { ...captured, logged }
}

function run(exception: unknown, correlationId?: string): Captured {
  return correlationId === undefined
    ? runWith(exception)
    : runWith(exception, { correlationId })
}

function bodyOf(captured: Captured): Record<string, unknown> {
  return captured.body as Record<string, unknown>
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
    {
      name: "FakeUnprocessableError",
      err: new FakeUnprocessableError(),
      status: 422,
    },
    { name: "FakeNotFoundError", err: new FakeNotFoundError(), status: 404 },
    { name: "PoolSaturatedError", err: new PoolSaturatedError(), status: 503 },
    { name: "ForbiddenError", err: new ForbiddenError(), status: 403 },
    {
      name: "FakeRateLimitedError",
      err: new FakeRateLimitedError(30),
      status: 429,
    },
  ]

  it.each(cases)(
    "$name → status $status, type e title presentes",
    ({ err, status }) => {
      const r = run(err)
      const body = r.body as Record<string, unknown>
      expect(r.status).toBe(status)
      expect(body.status).toBe(status)
      expect(typeof body.type).toBe("string")
      expect(typeof body.title).toBe("string")
    }
  )
})

class FakeConflictError extends DomainError {
  readonly status = 409
  readonly type = "https://errors.example.com/conflict"
  constructor() {
    super("Conflito de agenda", "O horário já está reservado")
  }
}

class FakeThrottledError extends DomainError {
  readonly status = 429
  readonly type = "https://errors.example.com/throttled"
  constructor() {
    super("Muitas tentativas")
  }
}

function zodFailure(): { exception: ZodValidationException; issues: unknown } {
  const parsed = z
    .object({ age: z.number() })
    .safeParse({ age: "não é número" })
  if (parsed.success) {
    throw new Error("o payload de teste precisa falhar na validação")
  }
  return {
    exception: new ZodValidationException(parsed.error),
    issues: parsed.error.issues,
  }
}

describe("ProblemDetailsFilter — corpo do DomainError", () => {
  it("copia type, title, status e detail do erro", () => {
    const r = runWith(new FakeConflictError())
    expect(r.status).toBe(409)
    expect(r.body).toEqual({
      type: "https://errors.example.com/conflict",
      title: "Conflito de agenda",
      status: 409,
      detail: "O horário já está reservado",
      instance: "/v1/auth/login",
      correlationId: null,
    })
  })

  it("fora de um escopo de request o correlationId sai nulo", () => {
    const r = runWith(new Error("boom"))
    expect(bodyOf(r).correlationId).toBeNull()
  })

  it("dentro do escopo o correlationId do contexto entra no corpo", () => {
    const r = runWith(new Error("boom"), { correlationId: "corr-500" })
    expect(bodyOf(r).correlationId).toBe("corr-500")
  })
})

describe("ProblemDetailsFilter — falha de validação", () => {
  it("ZodValidationException vira 400 com as issues do zod em errors", () => {
    const { exception, issues } = zodFailure()
    const r = runWith(exception)
    const body = bodyOf(r)
    expect(r.status).toBe(400)
    expect(body.type).toBe("https://errors.example.com/validation")
    expect(body.title).toBe("Erro de validação")
    expect(body.detail).toBe("Payload inválido")
    expect(body.errors).toEqual(issues)
  })

  it("erro de validação sem issues sai com errors ausente", () => {
    const r = runWith(new ZodValidationException({ message: "sem issues" }))
    const body = bodyOf(r)
    expect(r.status).toBe(400)
    expect(body.errors).toBeUndefined()
    expect(body.title).toBe("Erro de validação")
  })
})

describe("ProblemDetailsFilter — título da HttpException", () => {
  it("resposta string vira o próprio título", () => {
    const r = runWith(new HttpException("Acesso negado", 403))
    const body = bodyOf(r)
    expect(r.status).toBe(403)
    expect(body.type).toBe("https://errors.example.com/http/403")
    expect(body.title).toBe("Acesso negado")
  })

  it("message string do objeto de resposta vira o título", () => {
    const r = runWith(new HttpException({ message: "Campo obrigatório" }, 400))
    expect(bodyOf(r).title).toBe("Campo obrigatório")
  })

  it("message em lista é juntada por vírgula", () => {
    const r = runWith(
      new HttpException({ message: ["email inválido", "senha curta"] }, 400)
    )
    expect(bodyOf(r).title).toBe("email inválido, senha curta")
  })

  it("message de outro tipo cai na mensagem da exceção", () => {
    const exception = new HttpException({ message: 42 }, 400)
    const r = runWith(exception)
    expect(bodyOf(r).title).toBe(exception.message)
  })

  it("resposta sem message cai na mensagem da exceção", () => {
    const exception = new HttpException({ error: "Bad Request" }, 400)
    const r = runWith(exception)
    expect(bodyOf(r).title).toBe(exception.message)
  })
})

describe("ProblemDetailsFilter — instance sem PII", () => {
  it("trunca a url no primeiro ? e não ecoa a query", () => {
    const r = runWith(new ForbiddenError(), {
      url: "/v1/auth/login?token=segredo&email=ana@example.com",
    })
    expect(bodyOf(r).instance).toBe("/v1/auth/login")
    const json = JSON.stringify(r.body)
    expect(json).not.toContain("segredo")
    expect(json).not.toContain("ana@example.com")
  })

  it("url sem query string entra inteira", () => {
    const r = runWith(new ForbiddenError(), { url: "/v1/things/42" })
    expect(bodyOf(r).instance).toBe("/v1/things/42")
  })
})

describe("ProblemDetailsFilter — log do que é 5xx", () => {
  it("status 500 ou mais registra unhandled_exception com o erro original", () => {
    const exception = new Error("boom")
    const r = runWith(exception)
    expect(r.status).toBe(500)
    expect(r.logged).toEqual([
      { event: "unhandled_exception", fields: { err: exception } },
    ])
  })

  it("status 4xx não registra nada", () => {
    const r = runWith(new ForbiddenError())
    expect(r.status).toBe(403)
    expect(r.logged).toEqual([])
  })
})

describe("ProblemDetailsFilter — DEFAULT_LOCALE (pacote de mensagens)", () => {
  it("validação: pacote pt-BR padrão reproduz as strings atuais sem mudança", () => {
    const { exception } = zodFailure()
    const r = runWith(exception)
    const body = bodyOf(r)
    expect(body.title).toBe("Erro de validação")
    expect(body.detail).toBe("Payload inválido")
  })

  it("erro interno: pacote pt-BR padrão reproduz a string atual sem mudança", () => {
    const r = runWith(new Error("boom"))
    expect(bodyOf(r).title).toBe("Erro interno")
  })

  it("DomainError não passa pelo pacote — title continua pass-through do próprio erro", () => {
    const r = runWith(new FakeConflictError())
    expect(bodyOf(r).title).toBe("Conflito de agenda")
  })
})

describe("ProblemDetailsFilter — fallback do Retry-After", () => {
  it("DomainError 429 sem retryAfterSeconds cai em 60", () => {
    const r = runWith(new FakeThrottledError())
    expect(r.status).toBe(429)
    expect(r.headers["Retry-After"]).toBe("60")
  })

  it("retryAfter que não é número cai em 60", () => {
    const r = runWith(
      new HttpException({ message: "rate", retryAfter: "45" }, 429)
    )
    expect(r.headers["Retry-After"]).toBe("60")
  })

  it("objeto de resposta sem retryAfter cai em 60", () => {
    const r = runWith(new HttpException({ message: "rate" }, 429))
    expect(r.headers["Retry-After"]).toBe("60")
  })

  it("400 nunca recebe Retry-After", () => {
    const r = runWith(new HttpException("Requisição inválida", 400))
    expect(r.status).toBe(400)
    expect(r.headers["Retry-After"]).toBeUndefined()
  })
})

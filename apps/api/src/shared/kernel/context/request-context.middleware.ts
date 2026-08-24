import { performance } from "node:perf_hooks"

import { context, trace } from "@opentelemetry/api"
import { isValid, ulid } from "ulid"

import type { RequestContext, RequestContextStore } from "./request-context"
import type { NextFunction, Request, Response } from "express"

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

/**
 * Adota o X-Correlation-Id do cliente só se for um ULID válido; senão usa o
 * requestId gerado. Normaliza para uppercase (ULID canônico) — evita id forjado
 * ou injeção de conteúdo arbitrário em log/resposta.
 */
function safeCorrelationId(raw: string | null, fallback: string): string {
  return raw !== null && isValid(raw) ? raw.toUpperCase() : fallback
}

/**
 * Funcional de propósito: aplicado via `app.use` no boot para rodar antes de
 * tudo e fora do matcher de rotas do Nest (evita o path-to-regexp v8).
 */
export function createRequestContextMiddleware(ctx: RequestContext) {
  return function requestContextMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ): void {
    const requestId = ulid()
    const spanContext = trace.getSpanContext(context.active())
    const store: RequestContextStore = {
      requestId,
      correlationId: safeCorrelationId(
        firstHeader(req.headers["x-correlation-id"]),
        requestId
      ),
      causationId: null,
      traceId: spanContext?.traceId ?? null,
      spanId: spanContext?.spanId ?? null,
      tenantId: null,
      origin: "http",
      actor: null,
      extensions: new Map(),
      locale: firstHeader(req.headers["accept-language"]) ?? "pt-BR",
      ip: req.ip ?? null,
      userAgent: firstHeader(req.headers["user-agent"]),
      startedAt: performance.now(),
    }
    ctx.run(store, () => {
      next()
    })
  }
}

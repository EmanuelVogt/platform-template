import { performance } from "node:perf_hooks"

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common"
import { tap } from "rxjs/operators"

import { env } from "../../config/env"

import { redactValue } from "./log.redact"
import { type AppLogger, LoggerFactory } from "./logger.factory"

import type { Request, Response } from "express"
import type { Observable } from "rxjs"


/** Remove query string da url — evita logar token/email de ?token=, ?email=. */
export function stripQuery(url: string): string {
  return url.split("?")[0] ?? url
}

/** Body só entra no log se tiver conteúdo — não polui GET/DELETE com `{}`. */
function hasBody(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    Object.keys(body).length > 0
  )
}

@Injectable()
export class LogInterceptor implements NestInterceptor {
  private readonly log: AppLogger
  // Detalhe (body + resposta) só em development: o pino-pretty formata multi-linha
  // e nada extra vaza pra staging/prod nem pros testes. PII vai redigida por redactValue.
  private readonly verbose = env().NODE_ENV === "development"

  constructor(loggerFactory: LoggerFactory) {
    this.log = loggerFactory.forModule("http")
  }

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    if (executionContext.getType() !== "http") {
      return next.handle()
    }
    const start = performance.now()
    const http = executionContext.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    const reqBody =
      this.verbose && hasBody(req.body)
        ? { reqBody: redactValue(req.body) }
        : {}

    return next.handle().pipe(
      tap({
        next: (payload: unknown) => {
          this.log.info("http", {
            method: req.method,
            url: stripQuery(req.originalUrl),
            status: res.statusCode,
            durationMs: Math.round(performance.now() - start),
            ...reqBody,
            ...(this.verbose ? { resBody: redactValue(payload) } : {}),
          })
        },
        error: (err: unknown) => {
          this.log.error("http", {
            method: req.method,
            url: stripQuery(req.originalUrl),
            durationMs: Math.round(performance.now() - start),
            ...reqBody,
            err,
          })
        },
      })
    )
  }
}

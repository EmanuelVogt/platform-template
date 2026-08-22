import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from "@nestjs/common"
import { ZodValidationException } from "nestjs-zod"

import { RequestContext } from "../context/request-context"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"

import { DomainError } from "./domain.error"

import type { Request, Response } from "express"

type ProblemDetails = {
  type: string
  title: string
  status: number
  detail?: string
  instance: string
  correlationId: string | null
  errors?: unknown
} & Record<string, unknown>

function asTitle(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    return value.join(", ")
  }
  return fallback
}

// getZodError() é tipado como `unknown` no nestjs-zod v5; extrai issues com guard.
function extractIssues(zodError: unknown): unknown {
  if (zodError !== null && typeof zodError === "object" && "issues" in zodError) {
    return (zodError).issues
  }
  return undefined
}

function toProblem(
  exception: unknown,
  instance: string,
  correlationId: string | null
): ProblemDetails {
  if (exception instanceof DomainError) {
    return {
      ...(exception.extensions ?? {}),
      type: exception.type,
      title: exception.title,
      status: exception.status,
      detail: exception.message,
      instance,
      correlationId,
    }
  }
  if (exception instanceof ZodValidationException) {
    return {
      type: "https://errors.example.com/validation",
      title: "Erro de validação",
      status: 400,
      detail: "Payload inválido",
      instance,
      correlationId,
      errors: extractIssues(exception.getZodError()),
    }
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus()
    const response = exception.getResponse()
    const title =
      typeof response === "string"
        ? response
        : asTitle((response as { message?: unknown }).message, exception.message)
    return {
      type: `https://errors.example.com/http/${status}`,
      title,
      status,
      instance,
      correlationId,
    }
  }
  return {
    type: "https://errors.example.com/internal",
    title: "Erro interno",
    status: 500,
    instance,
    correlationId,
  }
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly log: AppLogger

  constructor(
    loggerFactory: LoggerFactory,
    private readonly ctx: RequestContext
  ) {
    this.log = loggerFactory.forModule("ExceptionFilter")
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()
    const correlationId = this.ctx.tryGet()?.correlationId ?? null
    // Sem query string: evita ecoar PII/token (?token=, ?email=) na resposta.
    const queryStart = req.originalUrl.indexOf("?")
    const instance =
      queryStart === -1 ? req.originalUrl : req.originalUrl.slice(0, queryStart)
    const problem = toProblem(exception, instance, correlationId)

    if (problem.status >= 500) {
      this.log.error("unhandled_exception", { err: exception })
    }

    if (problem.status === 429 || problem.status === 503) {
      // Retry-After de qualquer 429 ou 503: DomainError que preenche o campo
      // opcional da base (RateLimitedError, PoolSaturatedError) OU HttpException
      // do throttler; fallback 60s.
      let retryAfter = 60
      if (
        exception instanceof DomainError &&
        typeof exception.retryAfterSeconds === "number"
      ) {
        retryAfter = exception.retryAfterSeconds
      } else if (exception instanceof HttpException) {
        const body = exception.getResponse()
        if (typeof body === "object" && "retryAfter" in body) {
          const value = body.retryAfter
          if (typeof value === "number") {
            retryAfter = value
          }
        }
      }
      res.header("Retry-After", String(retryAfter))
    }

    res.status(problem.status).type("application/problem+json").json(problem)
  }
}

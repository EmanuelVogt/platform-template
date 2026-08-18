import { createHash } from "node:crypto"

import {
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
  UnprocessableEntityException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { firstValueFrom, from, type Observable } from "rxjs"

import { RequestContext } from "../context/request-context"

import {
  IdempotencyRepository,
  type IdempotencyStatus,
} from "./idempotency.repository"
import {
  IDEMPOTENT_METADATA,
  type IdempotentOptions,
} from "./idempotent.decorator"

import type { Request, Response } from "express"

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((k) => [k, sortKeys(record[k])])
    )
  }
  return value
}

function hashRequest(req: Request): string {
  const canonical = JSON.stringify({
    method: req.method,
    path: req.originalUrl.split("?")[0],
    body: sortKeys(req.body as unknown),
  })
  return createHash("sha256").update(canonical).digest("hex")
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly repo: IdempotencyRepository,
    private readonly ctx: RequestContext
  ) {}

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    const opts = this.reflector.get<IdempotentOptions | undefined>(
      IDEMPOTENT_METADATA,
      executionContext.getHandler()
    )
    if (!opts || executionContext.getType() !== "http") {
      return next.handle()
    }
    const req = executionContext
      .switchToHttp()
      .getRequest<Request>()
    const key = firstHeader(req.headers["idempotency-key"])
    // Header opcional por design (modelo Stripe): sem chave → sem dedup,
    // duplicação fica com a constraint de domínio. Não voltar a exigir (400).
    if (!key) {
      return next.handle()
    }
    return from(this.process(executionContext, next, opts, key))
  }

  private async process(
    executionContext: ExecutionContext,
    next: CallHandler,
    opts: IdempotentOptions,
    key: string
  ): Promise<unknown> {
    const http = executionContext.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    const requestHash = hashRequest(req)
    const ctx = this.ctx.tryGet()
    const scope = `${ctx?.tenantId ?? "_"}:${ctx?.userId ?? "_"}`
    const endpoint = `${req.method} ${req.originalUrl.split("?")[0] ?? ""}`
    const expiresAt = new Date(Date.now() + opts.ttlHours * 3_600_000)

    const existing = await this.repo.tryReserve({
      scope,
      key,
      endpoint,
      requestHash,
      expiresAt,
    })

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          "Idempotency-Key reusada com payload diferente"
        )
      }
      if (existing.status === "in_progress") {
        throw new ConflictException(
          "Requisição ainda em processamento, tente novamente"
        )
      }
      if (existing.status === "completed") {
        const persistedStatus = existing.responseStatus ?? 200
        if (persistedStatus >= 400) {
          // Replay de erro: re-lança pro ProblemDetailsFilter formatar RFC 7807
          // idêntico à 1ª resposta (senão a 2ª devolveria corpo cru / null).
          throw new HttpException(
            (existing.responseBody ?? "Erro") as string | Record<string, unknown>,
            persistedStatus
          )
        }
        res.status(persistedStatus)
        return existing.responseBody
      }
      // 'failed' → tenta reabrir (CAS failed→in_progress). Só o vencedor
      // re-executa o handler; concorrente perde a corrida e recebe 409.
      const claimed = await this.repo.reopen(scope, key)
      if (!claimed) {
        throw new ConflictException(
          "Requisição ainda em processamento, tente novamente"
        )
      }
    }

    return this.execute(scope, key, res, next)
  }

  // O snapshot (complete) roda APÓS o COMMIT do use case — o @Transactional do
  // handler abre/fecha a própria tx via ALS antes daqui, então este write é
  // separado, não atômico. Não envolver em tx do handler (acoplaria o kernel ao
  // decorator do use case). A janela in_progress órfã é reclamada por expires_at.
  private async execute(
    scope: string,
    key: string,
    res: Response,
    next: CallHandler
  ): Promise<unknown> {
    try {
      const result: unknown = await firstValueFrom(next.handle())
      // Snapshot NÃO redigido: o replay tem de devolver o corpo idêntico ao da 1ª
      // resposta. A mesma PII já vive nas tabelas de domínio do mesmo Postgres, a
      // row expira em ttlHours e o cleanup apaga — redigir aqui só quebra o replay.
      await this.repo.complete(scope, key, "completed", res.statusCode, result)
      return result
    } catch (err) {
      const status = err instanceof HttpException ? err.getStatus() : 500
      const persistedStatus: IdempotencyStatus =
        status >= 500 ? "failed" : "completed"
      const body =
        err instanceof HttpException && status < 500 ? err.getResponse() : null
      await this.repo.complete(scope, key, persistedStatus, status, body)
      throw err
    }
  }
}

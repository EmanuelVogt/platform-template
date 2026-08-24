import { Injectable } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"

import { type AppLogger, LoggerFactory } from "../logging/logger.factory"

import { InMemoryRateLimiter } from "./in-memory-rate-limiter"

import type {
  RateLimiter,
  RateLimitOptions,
  RateLimitResult,
} from "./rate-limiter.port"

/** Payload de `rate-limiter.degraded` — quem escuta registra o início da queda. */
export interface RateLimiterDegradedEvent {
  since: Date
  error: string
}

/**
 * Compõe o limiter primário (Redis) com um fallback local. Quando o primário
 * falha, a política é de quem chama: chave `critical` continua enforçada pela
 * janela em memória (mesmo limite e janela); chave comum libera — rate-limit
 * não é caminho crítico e não pode derrubar a API junto com o Redis.
 *
 * Um evento por queda, não por request: o primeiro erro depois de um período
 * saudável loga e emite `rate-limiter.degraded`; o primeiro sucesso depois
 * disso descarta o estado local e emite `rate-limiter.recovered`. Descartar é
 * o que evita contagem dobrada — o bucket do Redis já tem a verdade.
 */
@Injectable()
export class ResilientRateLimiter implements RateLimiter {
  private readonly log: AppLogger
  private degradedSince: Date | null = null

  constructor(
    private readonly primary: RateLimiter,
    private readonly fallback: InMemoryRateLimiter,
    private readonly emitter: EventEmitter2,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("ResilientRateLimiter")
  }

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
    opts?: RateLimitOptions
  ): Promise<RateLimitResult> {
    try {
      const result = await this.primary.consume(key, limit, windowSeconds)
      this.markHealthy()
      return result
    } catch (error) {
      this.markDegraded(error)
      if (opts?.critical === true) {
        return this.fallback.consume(key, limit, windowSeconds)
      }
      return { allowed: true, retryAfterSeconds: 0 }
    }
  }

  // SPEC_DEVIATION: reset não recebe `opts` — a porta fixada em design.md
  // § Data Models é `reset(key): Promise<void>`, sem RateLimitOptions.
  // Reason: sem o flag `critical` no contrato, o espelho fiel de `consume` é
  // limpar sempre a chave local no erro do primário (idempotente e sem custo),
  // em vez de deixar um bucket local vencido enforçando um limite já zerado.
  async reset(key: string): Promise<void> {
    try {
      await this.primary.reset(key)
      this.markHealthy()
    } catch (error) {
      this.markDegraded(error)
      await this.fallback.reset(key)
    }
  }

  private markDegraded(error: unknown): void {
    if (this.degradedSince !== null) {
      return
    }
    const since = new Date()
    const message = error instanceof Error ? error.message : String(error)
    this.degradedSince = since
    this.log.warn("rate-limit degradado: limiter primário indisponível", {
      err: message,
    })
    this.emitter.emit("rate-limiter.degraded", {
      since,
      error: message,
    } satisfies RateLimiterDegradedEvent)
  }

  private markHealthy(): void {
    if (this.degradedSince === null) {
      return
    }
    this.degradedSince = null
    // O primário voltou e é a fonte da verdade: manter a janela local somaria
    // ao bucket do Redis e cobraria a mesma tentativa duas vezes.
    this.fallback.clear()
    this.emitter.emit("rate-limiter.recovered")
  }
}

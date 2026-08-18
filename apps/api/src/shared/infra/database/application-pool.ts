import { performance } from "node:perf_hooks"

import { Pool } from "pg"

import {
  describeCaller,
  NestedAcquisitionError,
} from "../../kernel/errors/nested-acquisition.error"
import { PoolSaturatedError } from "../../kernel/errors/pool-saturated.error"
import { hasActiveTransaction } from "../../kernel/transactional/transaction-context"

import type { AppLogger } from "../../kernel/logging/logger.factory"
import type { PoolClient, PoolConfig } from "pg"

// Única marca que o pg-pool dá ao esgotar `connectionTimeoutMillis` esperando
// uma conexão livre: `new Error(...)` sem `code` nem classe própria. Falha de
// conexão de verdade (recusa, auth, rede) tem outra mensagem e NÃO é saturação
// — o int-spec provoca o timeout real para travar esta string contra upgrade.
const ACQUIRE_TIMEOUT_MESSAGE = "timeout exceeded when trying to connect"

export type ApplicationPoolOptions = {
  maxWaiting: number
  acquireWarnMs: number
  /** Ausente nos scripts de linha de comando, que rodam fora do container. */
  logger?: AppLogger
}

export type AcquireObserver = (waitedMs: number) => void

export type PoolStateSnapshot = {
  totalCount: number
  idleCount: number
  waitingCount: number
}

export type MeteredPool = PoolStateSnapshot & {
  setAcquireObserver: (observe: AcquireObserver) => void
}

/** Assinatura exata da forma callback de `Pool#connect`, sem redigitar `any`. */
type PoolConnectCallback = Parameters<Pool["connect"]>[0]

const noopRelease = (): void => undefined

/**
 * Subclasse (e não wrapper) porque o drizzle decide "isto é um pool?" com
 * `client instanceof Pool`: um objeto que só imita a interface cairia no ramo
 * "não é pool" e rodaria transação sem `connect`.
 */
export class ApplicationPool extends Pool implements MeteredPool {
  private readonly maxWaiting: number
  private readonly acquireWarnMs: number
  private readonly logger?: AppLogger
  private acquireObserver?: AcquireObserver

  constructor(config: PoolConfig, options: ApplicationPoolOptions) {
    super(config)
    this.maxWaiting = options.maxWaiting
    this.acquireWarnMs = options.acquireWarnMs
    this.logger = options.logger
  }

  /** Ligado depois da construção: o pool nasce antes do container Nest. */
  setAcquireObserver(observe: AcquireObserver): void {
    this.acquireObserver = observe
  }

  override connect(): Promise<PoolClient>
  override connect(callback: PoolConnectCallback): void
  override connect(
    callback?: PoolConnectCallback
  ): Promise<PoolClient> | undefined {
    const refusal = this.refuseAcquisition()

    if (!callback) {
      // Rejeita em vez de lançar síncrono: `pool.connect().catch(h)` tem de
      // capturar a recusa, como captura no `pg-pool` quando o pool está
      // encerrando. Lançar aqui só seria visível a quem usasse `await`.
      if (refusal) return Promise.reject(refusal)
      // Promise construída sobre a forma callback para as duas saírem com o
      // mesmo erro traduzido e o mesmo retrato do pool.
      return new Promise((resolve, reject) => {
        this.acquire((err, client) => {
          if (client) resolve(client)
          else reject(err ?? new Error("Aquisição sem client e sem erro"))
        })
      })
    }

    // `pool.query()` chama esta forma: entregar o erro AO callback faz a promise
    // de query() rejeitar; lançar aqui estouraria síncrono de dentro do pg.
    if (refusal) {
      callback(refusal, undefined, noopRelease)
      return undefined
    }
    this.acquire(callback)
    return undefined
  }

  private acquire(callback: PoolConnectCallback): void {
    const startedAt = performance.now()
    super.connect((err, client, done) => {
      this.reportAcquisition(startedAt)
      if (err) {
        callback(this.translateAcquireError(err), undefined, noopRelease)
        return
      }
      callback(err, client, done)
    })
  }

  /**
   * Roda DENTRO do callback do pg, no mesmo turno síncrono em que o timeout
   * dispara: os contadores são o retrato do instante da falha, não do momento
   * em que alguém for ler o log.
   */
  private translateAcquireError(error: Error): Error {
    if (error.message !== ACQUIRE_TIMEOUT_MESSAGE) return error
    this.logger?.warn("db.pool_acquire_timeout", {
      totalCount: this.totalCount,
      idleCount: this.idleCount,
      waitingCount: this.waitingCount,
    })
    return new PoolSaturatedError()
  }

  private refuseAcquisition(): Error | undefined {
    if (hasActiveTransaction()) {
      return new NestedAcquisitionError(describeCaller())
    }
    if (this.waitingCount >= this.maxWaiting) {
      this.logger?.warn("db.pool_queue_full", {
        maxWaiting: this.maxWaiting,
        totalCount: this.totalCount,
        idleCount: this.idleCount,
        waitingCount: this.waitingCount,
      })
      return new PoolSaturatedError()
    }
    return undefined
  }

  private reportAcquisition(startedAt: number): void {
    const waitedMs = Math.round(performance.now() - startedAt)
    this.observeAcquire(waitedMs)
    if (waitedMs <= this.acquireWarnMs) return
    this.logger?.warn("db.pool_acquire_slow", {
      waitedMs,
      totalCount: this.totalCount,
      idleCount: this.idleCount,
      waitingCount: this.waitingCount,
    })
  }

  // Roda dentro do callback do pg: métrica que lança aqui mataria a conexão que
  // o chamador estava esperando — o observador é engolido de propósito.
  private observeAcquire(waitedMs: number): void {
    try {
      this.acquireObserver?.(waitedMs)
    } catch (err) {
      this.logger?.warn("db.pool_metrics_failed", {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

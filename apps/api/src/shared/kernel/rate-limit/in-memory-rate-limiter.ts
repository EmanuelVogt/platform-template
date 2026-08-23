import { SystemClock } from "../clock/system-clock"

import type { RateLimiter, RateLimitResult } from "./rate-limiter.port"
import type { Clock } from "../clock/clock"

/**
 * Teto de chaves rastreadas. Sem ele uma queda do Redis viraria vetor de
 * memória: cada IP/conta novo criaria uma entrada que só sai quando a janela
 * fecha, e nada garante que ela feche antes do processo estourar.
 */
export const MAX_TRACKED_KEYS = 50_000

/**
 * Sliding window por instância — mesma aritmética do script Lua do Redis, em
 * JS. Serve de fallback local para chaves críticas enquanto o Redis está fora:
 * N instâncias enforçam N × o limite, o que é aceitável perto de não enforçar
 * nada. Não substitui o Redis em regime normal.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly clock: Clock = new SystemClock()) {}

  /** Chaves com eventos vivos neste instante (observável para provar o teto). */
  get trackedKeys(): number {
    return this.hits.size
  }

  consume(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const nowMs = this.clock.now().getTime()
    const windowMs = windowSeconds * 1000
    // Poda em toda chamada: o Lua faz ZREMRANGEBYSCORE 0..now-window, que é
    // inclusivo — só sobrevive quem é estritamente mais novo que a borda.
    const alive = (this.hits.get(key) ?? []).filter(
      (at) => at > nowMs - windowMs
    )

    if (alive.length < limit) {
      alive.push(nowMs)
      this.touch(key, alive)
      return Promise.resolve({ allowed: true, retryAfterSeconds: 0 })
    }

    this.touch(key, alive)
    // Gate negado não consome slot: a espera é até o evento mais antigo sair
    // da janela, com piso de 1s (o Lua arredonda para cima e nunca devolve 0).
    const oldest = alive[0] ?? nowMs
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - nowMs) / 1000)
    )
    return Promise.resolve({ allowed: false, retryAfterSeconds })
  }

  reset(key: string): Promise<void> {
    this.hits.delete(key)
    return Promise.resolve()
  }

  /** Descarta todo o estado local — usado quando o backend primário volta. */
  clear(): void {
    this.hits.clear()
  }

  /**
   * Regrava a chave no fim da ordem de inserção do Map, para que a primeira
   * entrada seja sempre a menos recentemente tocada, e despeja essa quando o
   * teto seria ultrapassado por uma chave nova.
   */
  private touch(key: string, alive: number[]): void {
    if (alive.length === 0) {
      this.hits.delete(key)
      return
    }
    this.hits.delete(key)
    if (this.hits.size >= MAX_TRACKED_KEYS) {
      const oldestKey = this.hits.keys().next().value
      if (oldestKey !== undefined) {
        this.hits.delete(oldestKey)
      }
    }
    this.hits.set(key, alive)
  }
}

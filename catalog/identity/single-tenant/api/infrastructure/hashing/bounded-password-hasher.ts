import { InFlightGate } from "../../../../shared/kernel/collections/in-flight-gate"
import { PasswordHashingSaturatedError } from "../../domain/errors"

import type { PasswordHasher } from "../../domain/ports/password-hasher"

/**
 * Teto de argon2 simultâneos. Cada hash ocupa uma thread do pool do libuv por
 * dezenas de ms; sem teto, uma inundação de login não autenticado consome o
 * pool inteiro e trava toda I/O do processo — inclusive as rotas que nada têm
 * a ver com senha. Sem vaga a resposta é 503 imediato: enfileirar trocaria
 * saturação por latência ilimitada.
 */
export class BoundedPasswordHasher implements PasswordHasher {
  private readonly gate: InFlightGate

  constructor(
    private readonly inner: PasswordHasher,
    maxInFlight: number
  ) {
    this.gate = new InFlightGate(maxInFlight)
  }

  async hash(plain: string): Promise<string> {
    return this.bounded(() => this.inner.hash(plain))
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return this.bounded(() => this.inner.verify(plain, hash))
  }

  /** Puro (parse dos parâmetros do hash), não toca o pool — passa direto. */
  needsRehash(hash: string): boolean {
    return this.inner.needsRehash(hash)
  }

  private async bounded<T>(run: () => Promise<T>): Promise<T> {
    const release = this.gate.tryAcquire()
    if (release === null) {
      throw new PasswordHashingSaturatedError()
    }
    try {
      return await run()
    } finally {
      release()
    }
  }
}

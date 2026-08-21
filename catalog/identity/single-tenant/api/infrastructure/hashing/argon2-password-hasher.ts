import { createHmac, randomBytes } from "node:crypto"

import argon2 from "argon2"

import type { PasswordHasher } from "../../domain/ports/password-hasher"

/** Parâmetros do argon2id + pepper. Origem: env (floors OWASP, spec §7/§9). */
export interface Argon2Options {
  pepper: string
  memoryKib: number
  timeCost: number
  parallelism: number
  hashLength: number
  saltLength: number
}

/**
 * Hasher argon2id com pepper aplicado via HMAC-SHA256 ANTES do argon2.
 * Dump da tabela `users` sem o pepper não é crackeável offline (spec §7).
 */
export class Argon2PasswordHasher implements PasswordHasher {
  constructor(private readonly opts: Argon2Options) {}

  async hash(plain: string): Promise<string> {
    return argon2.hash(this.peppered(plain), {
      type: argon2.argon2id,
      memoryCost: this.opts.memoryKib,
      timeCost: this.opts.timeCost,
      parallelism: this.opts.parallelism,
      hashLength: this.opts.hashLength,
      // argon2 v0.44 não expõe saltLength; passamos um salt do tamanho do floor.
      salt: randomBytes(this.opts.saltLength),
    })
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, this.peppered(plain))
    } catch {
      // Hash malformado/corrompido nunca verifica.
      return false
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      memoryCost: this.opts.memoryKib,
      timeCost: this.opts.timeCost,
      parallelism: this.opts.parallelism,
    })
  }

  /** Aplica o pepper como HMAC-SHA256 e devolve hex; argon2 hasheia o resultado. */
  private peppered(plain: string): string {
    return createHmac("sha256", this.opts.pepper).update(plain).digest("hex")
  }
}

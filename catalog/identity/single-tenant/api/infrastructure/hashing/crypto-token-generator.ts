import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import type {
  GeneratedToken,
  TokenGenerator,
} from "../../domain/ports/token-generator"

/**
 * Token opaco: 32 bytes aleatórios em base64url (raw) + sha256 hex (repouso).
 * Proibido ulid/uuid/Math.random como material de token (spec §8): timestamp
 * previsível reduz o espaço de busca.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  generate(): GeneratedToken {
    const raw = randomBytes(32).toString("base64url")
    return { raw, hash: this.hashOf(raw) }
  }

  hashOf(raw: string): string {
    return createHash("sha256").update(raw).digest("hex")
  }

  safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    // timingSafeEqual exige mesmo comprimento; tamanho distinto já é desigual.
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  }
}

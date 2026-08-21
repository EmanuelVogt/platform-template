import { createHmac, timingSafeEqual } from "node:crypto"

import type { Csrf } from "../../domain/ports/csrf"

/**
 * CSRF signed double-submit (spec §11): token = HMAC-SHA256(CSRF_SECRET, sessionId).
 * O servidor recomputa do sessionId da sessão httpOnly e compara em tempo constante.
 */
export class HmacCsrf implements Csrf {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error(
        "CSRF_SECRET ausente ou curto (<32) — exigido para signed double-submit."
      )
    }
  }

  sign(sessionId: string): string {
    return createHmac("sha256", this.secret).update(sessionId).digest("hex")
  }

  verify(sessionId: string, token: string): boolean {
    const expected = Buffer.from(this.sign(sessionId))
    const given = Buffer.from(token)
    if (expected.length !== given.length) return false
    return timingSafeEqual(expected, given)
  }
}

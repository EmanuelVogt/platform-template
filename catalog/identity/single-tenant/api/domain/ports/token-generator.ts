export interface GeneratedToken {
  /** Token cru, enviado ao usuário (link/cookie). Nunca persistido. */
  raw: string;
  /** sha256 do raw — só isto vai ao banco. */
  hash: string;
}

export interface TokenGenerator {
  /** randomBytes(32).base64url + sha256. */
  generate(): GeneratedToken;
  hashOf(raw: string): string;
  /** Comparação em tempo constante (timingSafeEqual). */
  safeEqual(a: string, b: string): boolean;
}

export const TOKEN_GENERATOR: unique symbol = Symbol('TokenGenerator');

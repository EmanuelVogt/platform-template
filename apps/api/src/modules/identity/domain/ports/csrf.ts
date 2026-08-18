export interface Csrf {
  /** Assina um token CSRF (HMAC) atrelado à sessão. */
  sign(sessionId: string): string;
  verify(sessionId: string, token: string): boolean;
}

export const CSRF: unique symbol = Symbol('Csrf');

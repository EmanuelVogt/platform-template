import type { Request, Response } from "express"

/** Subconjunto da config de cookie usado na emissão/limpeza. */
export interface CookieConfig {
  COOKIE_NAME: string
  COOKIE_SECURE: boolean
  COOKIE_SAMESITE: "lax" | "none" | "strict"
}

/**
 * Atributos canônicos do cookie de sessão — usados IDÊNTICOS na emissão e na
 * limpeza. Sem `domain` (exigência do prefixo `__Host-`).
 */
export function COOKIE_OPTIONS(cfg: CookieConfig) {
  return {
    httpOnly: true,
    secure: cfg.COOKIE_SECURE,
    sameSite: cfg.COOKIE_SAMESITE,
    path: "/",
  } as const
}

/** Emite o cookie de sessão com o token raw. `maxAgeSeconds` controla o Max-Age. */
export function setSessionCookie(
  res: Response,
  cfg: CookieConfig,
  rawToken: string,
  maxAgeSeconds: number
): void {
  res.cookie(cfg.COOKIE_NAME, rawToken, {
    ...COOKIE_OPTIONS(cfg),
    maxAge: maxAgeSeconds * 1000,
  })
}

/** Apaga o cookie de sessão — atributos idênticos aos de emissão + Max-Age 0. */
export function clearSessionCookie(res: Response, cfg: CookieConfig): void {
  res.cookie(cfg.COOKIE_NAME, "", {
    ...COOKIE_OPTIONS(cfg),
    maxAge: 0,
  })
}

/** Config de cookie de device — reusa os atributos canônicos + nome próprio. */
export interface DeviceCookieConfig extends CookieConfig {
  DEVICE_COOKIE_NAME: string
}

/**
 * Emite o cookie de device (token opaco, NÃO credencial). Atributos idênticos
 * ao de sessão (httpOnly/secure/sameSite/path, sem domain pelo prefixo __Host-).
 * Logout NÃO apaga este cookie (D4): é o que reconhece o aparelho no próximo login.
 */
export function setDeviceCookie(
  res: Response,
  cfg: DeviceCookieConfig,
  rawToken: string,
  maxAgeSeconds: number
): void {
  res.cookie(cfg.DEVICE_COOKIE_NAME, rawToken, {
    ...COOKIE_OPTIONS(cfg),
    maxAge: maxAgeSeconds * 1000,
  })
}

export function readDeviceCookie(
  req: Request,
  cfg: DeviceCookieConfig
): string | null {
  return (
    (req.cookies as Record<string, string> | undefined)?.[
      cfg.DEVICE_COOKIE_NAME
    ] ?? null
  )
}

/** Subconjunto da config lido na emissão do cookie de CSRF. */
export interface CsrfCookieConfig extends CookieConfig {
  CSRF_COOKIE_NAME: string
}

/**
 * Emite o token CSRF (HMAC do sessionId) num cookie legível por JS. httpOnly é
 * `false` de propósito: o SPA precisa LER o valor para refletir no header
 * X-CSRF-Token (double-submit). Não é segredo de sessão — é um HMAC público.
 */
export function setCsrfCookie(
  res: Response,
  cfg: CsrfCookieConfig,
  token: string
): void {
  res.cookie(cfg.CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: cfg.COOKIE_SECURE,
    sameSite: cfg.COOKIE_SAMESITE,
    path: "/",
  })
}

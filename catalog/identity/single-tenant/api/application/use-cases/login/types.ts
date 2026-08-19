import type { UserView } from "../../views"

export type LoginInput = {
  email: string
  password: string
  rememberMe: boolean
  /** Cookie de device cru recebido no request (ausente = gera device novo). */
  deviceCookie?: string | null
}

export type LoginOutput = {
  user: UserView
  sessionToken: string
  /** TTL do cookie de sessão (segundos) — calculado no use-case, não no controller. */
  maxAgeSeconds: number
  /** PK da sessão — usada pelo controller p/ assinar o cookie CSRF (não vaza no body). */
  sessionId: string
  /** Token de device a (re)setar no cookie — sempre, sliding (D4). */
  deviceCookie: string
  /** TTL do cookie de device (segundos). */
  deviceCookieMaxAgeSeconds: number
}

import type { UserView } from "../../views"

export type ConfirmEmailChangeInput = {
  token: string
  /** Cookie de device cru do request (ausente = gera device novo). */
  deviceCookie?: string | null
}

export type ConfirmEmailChangeOutput = {
  user: UserView
  sessionToken: string
  maxAgeSeconds: number
  sessionId: string
  deviceCookie: string
  deviceCookieMaxAgeSeconds: number
}

import type { UserView } from "../../views"

export type SetPasswordInput = {
  token: string
  password: string
  name: string
  avatarAttachmentId?: string
  /** Cookie de device cru do request (ausente = gera device novo). */
  deviceCookie?: string | null
}

export type SetPasswordOutput = {
  user: UserView
  sessionToken: string
  maxAgeSeconds: number
  sessionId: string
  deviceCookie: string
  deviceCookieMaxAgeSeconds: number
}

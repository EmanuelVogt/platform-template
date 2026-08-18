// Shapes do payload de delivery por tipo (validados no handler pelo catálogo;
// daqui pra frente o payload é interno — sem re-validação, só narrowing).
export type AccessLinkEmailPayload = {
  email: string
  name: string
  link: string
  tokenExpiresAt: string
  locale: string
}

export type EmailVerificationEmailPayload = {
  email: string
  link: string
  tokenExpiresAt: string
  locale: string
}

export type PasswordResetEmailPayload = EmailVerificationEmailPayload

export type AccountLockoutEmailPayload = {
  email: string
  locale: string
}

export type PasswordChangedEmailPayload = {
  email: string
  at: string
  locale: string
}

export type DeviceNewLoginEmailPayload = {
  email: string
  deviceLabel: string
  ip: string | null
  at: string
  locale: string
}

export type EmailChangeRequestedEmailPayload = {
  email: string
  link: string
  tokenExpiresAt: string
  locale: string
}

export type EmailChangeNoticeEmailPayload = {
  email: string
  at: string
  locale: string
}

/** Envio de e-mail por template. idempotencyKey = delivery.id (dedupe no provider). */
export interface Mailer {
  sendAccessLink(
    to: string,
    link: string,
    name: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  sendPasswordReset(
    to: string,
    link: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  sendEmailVerification(
    to: string,
    link: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  sendLockoutNotice(
    to: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  sendPasswordChanged(
    to: string,
    at: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  sendDeviceNewLogin(
    to: string,
    deviceLabel: string,
    ip: string | null,
    at: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  /** Link de reativação enviado ao NOVO e-mail na troca self-service. */
  sendEmailChangeConfirmation(
    to: string,
    link: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
  /** Aviso de segurança enviado ao e-mail ANTIGO quando uma troca é solicitada. */
  sendEmailChangeNotice(
    to: string,
    at: string,
    locale: string,
    idempotencyKey?: string
  ): Promise<void>
}

export const MAILER: unique symbol = Symbol("Mailer")

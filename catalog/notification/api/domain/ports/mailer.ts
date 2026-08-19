export type EmailMessage = {
  to: string
  subject: string
  html: string
  idempotencyKey?: string
}

/** Só transporte: quem resolve template/assunto e renderiza é o `EmailChannel`. idempotencyKey = delivery.id (dedupe no provider). */
export interface Mailer {
  send(message: EmailMessage): Promise<void>
}

export const MAILER: unique symbol = Symbol("Mailer")

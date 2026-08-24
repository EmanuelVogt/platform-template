import { Resend } from "resend"

import { MailDeliveryError } from "./mailer.errors"

import type { EmailMessage, Mailer } from "../../domain/ports/mailer"

export interface ResendOptions {
  apiKey: string
  from: string
}

// Sem @Injectable: instanciado por useFactory (MAILER), não pelo container.
/** Mailer de produção via Resend. Só transporte: recebe o HTML já renderizado. */
export class ResendMailer implements Mailer {
  private readonly resend: Resend
  private readonly from: string

  constructor(opts: ResendOptions) {
    this.resend = new Resend(opts.apiKey)
    this.from = opts.from
  }

  async send(message: EmailMessage): Promise<void> {
    // Crash entre send e UPDATE status=sent → retry re-envia; a chave faz o
    // Resend dedupar (at-least-once vira efetivamente once no provider).
    const { error } = await this.resend.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      },
      message.idempotencyKey !== undefined
        ? { idempotencyKey: message.idempotencyKey }
        : undefined
    )
    if (error) {
      throw new MailDeliveryError(error.message)
    }
  }
}

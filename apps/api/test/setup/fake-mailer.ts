import type { EmailMessage, Mailer } from "../../src/modules/notification/domain/ports/mailer"

export function fakeMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    sent,
    async send(message: EmailMessage): Promise<void> {
      sent.push(message)
    },
  }
}

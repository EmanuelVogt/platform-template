// SPEC_DEVIATION: AD-021 — este fake e os 6 e2e que o usam
// (access-link-activation, auth-outbox-email, authz, create-user-flow,
// user-trash, verify-email) importam a porta `MAILER`/`Mailer` da entrada
// notification, então a suíte e2e do identity não roda num filho kernel-only.
// Reason: o fluxo coberto é identity → outbox → notification → mailer; o fake
// pertence a `catalog/notification/api/testing/` e a correção é mover fake e
// specs para lá (ou expor um probe de entrega no kernel). `catalog/notification`
// está fora do ownership desta task — reportado, não editado.
import type { EmailMessage, Mailer } from "../../notification/domain/ports/mailer"

export function fakeMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    sent,
    async send(message: EmailMessage): Promise<void> {
      sent.push(message)
    },
  }
}

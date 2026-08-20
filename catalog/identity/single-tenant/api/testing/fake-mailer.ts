// SPEC_DEVIATION: AD-021 — este fake e os 6 e2e que o usam
// (access-link-activation, auth-outbox-email, authz, create-user-flow,
// user-trash, verify-email) importam a porta `MAILER`/`Mailer` da entrada
// notification, então a suíte e2e do identity não roda num filho kernel-only.
// Reason: o fluxo coberto é identity → outbox → notification → mailer, ou seja
// estes e2e são testes de integração ENTRE entradas e pressupõem duas
// instaladas. Mover fake e specs para `catalog/notification` só inverte a
// aresta (lá eles passariam a depender do login do identity), e promover
// `MAILER` a porta do kernel colocaria "e-mail" no kernel para servir a um
// teste — notification declara E liga esse token, não é porta entre entradas
// (AD-024 não se aplica). A correção é dar um lugar no catálogo para suíte
// cruzada, instalada/typechecada só quando as duas entradas existem: mexe em
// `catalog/schema/**` e `scripts/**`, fora do ownership desta task.
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

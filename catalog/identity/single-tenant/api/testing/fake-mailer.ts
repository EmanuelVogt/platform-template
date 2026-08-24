// Este fake importa `MAILER`/`Mailer` da entrada notification. Sob AD-025 isso
// é dependência declarada, não desvio: identity já importa notification em dez
// use-cases de produção (`NotificationRequested`), a aresta identity →
// notification é a direção do DAG e não fecha ciclo. Os e2e cruzados
// identity ↔ notification moram aqui pela mesma razão — o e2e cruzado fica na
// entrada a jusante, nunca na dependência.
import type {
  EmailMessage,
  Mailer,
} from "../../notification/domain/ports/mailer"

export function fakeMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    sent,
    async send(message: EmailMessage): Promise<void> {
      sent.push(message)
    },
  }
}

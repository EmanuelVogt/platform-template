/**
 * Falha de entrega de e-mail pelo provedor. Propaga até o `OutboxDispatcher`,
 * que re-tenta com backoff (ver ADR 0022). Não vira resposta HTTP — por isso
 * não estende `DomainError`.
 */
export class MailDeliveryError extends Error {
  constructor(reason: string) {
    super(`falha na entrega de e-mail: ${reason}`)
    this.name = "MailDeliveryError"
  }
}

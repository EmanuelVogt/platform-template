/**
 * Erros de despacho de e-mail: propagam até o `OutboxDispatcher`, que re-tenta
 * com backoff (ver ADR 0022). Não viram resposta HTTP — por isso não estendem
 * `DomainError`, igual `MailDeliveryError`.
 */
export class EmailBindingMissingError extends Error {
  constructor(type: string) {
    super(`tipo de notificação sem binding de e-mail: ${type}`)
  }
}

export class EmailRecipientMissingError extends Error {
  constructor(type: string) {
    super(`destinatário de e-mail ausente ou inválido pro tipo: ${type}`)
  }
}

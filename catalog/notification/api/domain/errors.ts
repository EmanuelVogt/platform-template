const TYPE_BASE = "https://errors.example.com/notification"

/**
 * Erros de despacho de e-mail: propagam até o `OutboxDispatcher`, que re-tenta
 * com backoff (ver ADR 0022). Não viram resposta HTTP — por isso não estendem
 * `DomainError`, igual `MailDeliveryError`. `type` só identifica o erro no
 * namespace do módulo (convenção do guard error-namespace).
 */
export class EmailBindingMissingError extends Error {
  readonly type = `${TYPE_BASE}/email-binding-missing`

  constructor(type: string) {
    super(`tipo de notificação sem binding de e-mail: ${type}`)
  }
}

export class EmailRecipientMissingError extends Error {
  readonly type = `${TYPE_BASE}/email-recipient-missing`

  constructor(type: string) {
    super(`destinatário de e-mail ausente ou inválido pro tipo: ${type}`)
  }
}

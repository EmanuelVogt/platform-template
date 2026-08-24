export type AccessAction = "download" | "upload" | "delete"
export type AccessOutcome = "allowed" | "denied"

export interface AccessLogEntry {
  attachmentId: string
  userId: string | null
  ip: string | null
  userAgent: string | null
  action: AccessAction
  outcome: AccessOutcome
  correlationId: string | null
}

export type AttachmentAccessLogListItem = {
  id: string
  attachmentId: string
  userId: string | null
  action: AccessAction
  occurredAt: Date
}

export interface AttachmentAccessLogRepository {
  /**
   * Grava o acesso com commit imediato, no caminho que roda fora de transação
   * (o `denied` do download). Lança se houver tx ativa: dentro dela a gravação
   * pediria uma segunda conexão do pool — use `recordInTx`.
   */
  record(entry: AccessLogEntry): Promise<void>

  /**
   * Atrela o acesso à tx de negócio corrente. Exige transação aberta — lança
   * fora dela (não degrada pro executor raiz em silêncio).
   */
  recordInTx(entry: AccessLogEntry): Promise<void>

  /**
   * Lista acessos `allowed` do anexo, do mais recente para o mais antigo.
   */
  listByAttachment(
    attachmentId: string,
    limit: number
  ): Promise<AttachmentAccessLogListItem[]>

  /**
   * Apaga até `limit` registros anteriores a `cutoff`, dos mais antigos pros
   * mais novos. Retorno menor que `limit` indica que não sobrou vencido.
   */
  deleteBatchOlderThan(cutoff: Date, limit: number): Promise<number>
}

export const ATTACHMENT_ACCESS_LOG_REPOSITORY: unique symbol = Symbol(
  "AttachmentAccessLogRepository"
)

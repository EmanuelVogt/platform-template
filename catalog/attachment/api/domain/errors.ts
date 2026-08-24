import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/attachment"

/** Tabela única de mensagens do entry attachment — hoje reproduz as strings anteriores. */
const MESSAGES = {
  notFound: "Arquivo não encontrado",
  unsupportedMediaType: "Tipo de arquivo não suportado",
  payloadTooLarge: "Arquivo muito grande",
  uploadQuotaExceeded: "Limite de anexos excedido",
  emptyUploadBatchTitle: "Nenhum arquivo enviado",
  emptyUploadBatchDetail: "Selecione ao menos um arquivo para enviar.",
  invalidMultipartRequestTitle: "Envio inválido",
  invalidMultipartRequestDetail:
    "Os arquivos precisam ser enviados como multipart/form-data.",
  uploadsSaturatedTitle: "Muitos envios simultâneos",
  uploadsSaturatedDetail: "Tente novamente em alguns segundos.",
  pendingQuotaExceeded: "Cota de envios pendentes excedida",
  unexpectedMultipartFieldTitle: "Campo de envio inesperado",
  unexpectedMultipartFieldDetail: "O único campo de arquivo aceito é `file`.",
  uploadInterruptedTitle: "Envio interrompido",
  uploadInterruptedDetail: "A conexão caiu antes de o envio terminar.",
  uploadNotConfirmable: "Anexo inválido para este envio",
} as const

export { MESSAGES as ATTACHMENT_MESSAGES }

/** Attachment inexistente OU acesso negado — mesmo status/type (anti-enumeração). */
export class AttachmentNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/not-found`

  constructor() {
    super(MESSAGES.notFound)
  }
}

/** Content-Type não suportado (não é jpeg/png/webp, ou diverge dos magic bytes). */
export class UnsupportedMediaTypeError extends DomainError {
  readonly status = 415
  readonly type = `${TYPE_BASE}/unsupported-media-type`

  constructor() {
    super(MESSAGES.unsupportedMediaType)
  }
}

/** Arquivo acima do limite configurado. */
export class PayloadTooLargeError extends DomainError {
  readonly status = 413
  readonly type = `${TYPE_BASE}/payload-too-large`

  constructor(detail?: string) {
    super(MESSAGES.payloadTooLarge, detail)
  }
}

/** Lote acima do teto de tamanho ou de quantidade do perfil. */
export class UploadQuotaExceededError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/upload-quota-exceeded`

  constructor(detail: string) {
    super(MESSAGES.uploadQuotaExceeded, detail)
  }
}

/** Lote sem nenhum arquivo — o OpenAPI declara `file` obrigatório, mas o
 *  multipart em si não impede um envio vazio. */
export class EmptyUploadBatchError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/empty-upload-batch`

  constructor() {
    super(MESSAGES.emptyUploadBatchTitle, MESSAGES.emptyUploadBatchDetail)
  }
}

/** Corpo que não é multipart válido: content-type errado ou corpo truncado. */
export class InvalidMultipartRequestError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/invalid-multipart`

  constructor() {
    super(
      MESSAGES.invalidMultipartRequestTitle,
      MESSAGES.invalidMultipartRequestDetail
    )
  }
}

/** Instância sem vaga pra mais um upload concorrente — estado transitório. */
export class UploadsSaturatedError extends DomainError {
  readonly status = 503
  readonly type = `${TYPE_BASE}/uploads-saturated`
  override readonly retryAfterSeconds = 2

  constructor() {
    super(MESSAGES.uploadsSaturatedTitle, MESSAGES.uploadsSaturatedDetail)
  }
}

/** Bytes pendentes do dono somados ao envio atual estourariam a cota. */
export class PendingQuotaExceededError extends DomainError {
  readonly status = 413
  readonly type = `${TYPE_BASE}/pending-quota-exceeded`

  constructor(detail: string) {
    super(MESSAGES.pendingQuotaExceeded, detail)
  }
}

/** Parte multipart cujo campo não é o esperado — cliente enviando algo fora
 *  do contrato da rota. */
export class UnexpectedMultipartFieldError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/unexpected-multipart-field`

  constructor() {
    super(
      MESSAGES.unexpectedMultipartFieldTitle,
      MESSAGES.unexpectedMultipartFieldDetail
    )
  }
}

/** Conexão caiu antes de o corpo terminar de chegar — nada foi guardado. */
export class UploadInterruptedError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/upload-interrupted`

  constructor() {
    super(MESSAGES.uploadInterruptedTitle, MESSAGES.uploadInterruptedDetail)
  }
}

/** Pendente que não pode ser confirmado: dono errado, perfil errado, já usado
 *  ou objeto ausente no storage. */
export class UploadNotConfirmableError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/upload-not-confirmable`

  constructor() {
    super(MESSAGES.uploadNotConfirmable)
  }
}

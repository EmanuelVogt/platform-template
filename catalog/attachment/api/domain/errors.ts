import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/attachment"

/** Attachment inexistente OU acesso negado — mesmo status/type (anti-enumeração). */
export class AttachmentNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/not-found`

  constructor() {
    super("Arquivo não encontrado")
  }
}

/** Content-Type não suportado (não é jpeg/png/webp, ou diverge dos magic bytes). */
export class UnsupportedMediaTypeError extends DomainError {
  readonly status = 415
  readonly type = `${TYPE_BASE}/unsupported-media-type`

  constructor() {
    super("Tipo de arquivo não suportado")
  }
}

/** Arquivo acima do limite configurado. */
export class PayloadTooLargeError extends DomainError {
  readonly status = 413
  readonly type = `${TYPE_BASE}/payload-too-large`

  constructor(detail?: string) {
    super("Arquivo muito grande", detail)
  }
}

/** Lote acima do teto de tamanho ou de quantidade do perfil. */
export class UploadQuotaExceededError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/upload-quota-exceeded`

  constructor(detail: string) {
    super("Limite de anexos excedido", detail)
  }
}

/** Lote sem nenhum arquivo — o OpenAPI declara `file` obrigatório, mas o
 *  multipart em si não impede um envio vazio. */
export class EmptyUploadBatchError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/empty-upload-batch`

  constructor() {
    super(
      "Nenhum arquivo enviado",
      "Selecione ao menos um arquivo para enviar."
    )
  }
}

/** Corpo que não é multipart válido: content-type errado ou corpo truncado. */
export class InvalidMultipartRequestError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/invalid-multipart`

  constructor() {
    super(
      "Envio inválido",
      "Os arquivos precisam ser enviados como multipart/form-data."
    )
  }
}

/** Instância sem vaga pra mais um upload concorrente — estado transitório. */
export class UploadsSaturatedError extends DomainError {
  readonly status = 503
  readonly type = `${TYPE_BASE}/uploads-saturated`
  override readonly retryAfterSeconds = 2

  constructor() {
    super("Muitos envios simultâneos", "Tente novamente em alguns segundos.")
  }
}

/** Bytes pendentes do dono somados ao envio atual estourariam a cota. */
export class PendingQuotaExceededError extends DomainError {
  readonly status = 413
  readonly type = `${TYPE_BASE}/pending-quota-exceeded`

  constructor(detail: string) {
    super("Cota de envios pendentes excedida", detail)
  }
}

/** Parte multipart cujo campo não é o esperado — cliente enviando algo fora
 *  do contrato da rota. */
export class UnexpectedMultipartFieldError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/unexpected-multipart-field`

  constructor() {
    super(
      "Campo de envio inesperado",
      "O único campo de arquivo aceito é `file`."
    )
  }
}

/** Conexão caiu antes de o corpo terminar de chegar — nada foi guardado. */
export class UploadInterruptedError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/upload-interrupted`

  constructor() {
    super("Envio interrompido", "A conexão caiu antes de o envio terminar.")
  }
}

/** Pendente que não pode ser confirmado: dono errado, perfil errado, já usado
 *  ou objeto ausente no storage. */
export class UploadNotConfirmableError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/upload-not-confirmable`

  constructor() {
    super("Anexo inválido para este envio")
  }
}

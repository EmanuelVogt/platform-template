import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/identity"

/**
 * Tabela única de mensagens do entry identity — title/detail de cada erro.
 * Ponto único de swap quando o produto tiver um pacote não-pt-BR; hoje
 * reproduz exatamente as strings anteriores.
 */
const MESSAGES = {
  invalidCredentials: "Credenciais inválidas",
  weakPassword: "Senha fraca",
  invalidResetToken: "Token inválido ou expirado",
  sessionNotFound: "Sessão não encontrada",
  userNotFound: "Usuário não encontrado",
  rateLimited: "Muitas tentativas. Tente novamente mais tarde.",
  invalidAccessLink: "Link de acesso inválido ou expirado",
  emailAlreadyInUse: "Já existe um usuário com este e-mail",
  userNotInTrash: "Usuário não está na lixeira",
  accessLinkNotResendable: "Link de acesso não pode ser reenviado",
  profileImageStoreMissingTitle: "Imagem de perfil indisponível",
  profileImageStoreMissingDetail:
    "Nenhum armazenamento de imagem de perfil está registrado.",
  invalidAccountState: "Estado de conta inválido",
  cannotRevokeCurrentDevice:
    "Não é possível encerrar o dispositivo atual. Use o logout.",
  invalidPermissionSet: "Conjunto de permissões inválido",
  invalidProfessionalScope: "Áreas ou serviços de atuação inválidos",
  invalidSchedulingAreas: "Áreas de agendamento inválidas",
  professionalHasCommitmentsTitle: "A pessoa ainda tem compromisso marcado",
  professionalHasCommitmentsDetail:
    "Remarque os atendimentos e conduções listados antes de tirá-la do atendimento a clientes.",
  permissionTemplateNotFound: "Modelo de permissões não encontrado",
  permissionTemplateNameInUse:
    "Já existe um modelo de permissões com este nome",
  emailUnchanged: "O novo e-mail é igual ao atual",
  invalidEmailChangeToken: "Link de confirmação inválido ou expirado",
  avatarFileRequired: "Arquivo de avatar é obrigatório",
  permissionGrantNotAllowedTitle: "Acesso negado",
  permissionGrantNotAllowedDetail:
    "Não é possível conceder permissões que você não possui.",
  passwordHashingSaturatedTitle: "Serviço temporariamente indisponível",
  passwordHashingSaturatedDetail:
    "Muitas verificações de senha em andamento. Tente novamente em instantes.",
  breachCheckUnavailableTitle: "Serviço temporariamente indisponível",
  breachCheckUnavailableDetail:
    "Não foi possível verificar se a senha foi vazada. Tente novamente em instantes.",
} as const

export { MESSAGES as IDENTITY_MESSAGES }

/**
 * Falha de autenticação. UMA única classe para TODOS os caminhos de login
 * (user inexistente, senha errada, conta bloqueada, email não verificado).
 * Mesma mensagem, status e type — o campo `type` do RFC 7807 é legível, então
 * caminhos distintos não podem virar types distintos, senão vaza enumeração.
 */
export class InvalidCredentialsError extends DomainError {
  readonly status = 401
  readonly type = `${TYPE_BASE}/invalid-credentials`

  constructor() {
    super(MESSAGES.invalidCredentials)
  }
}

/** Senha não atende à política (comprimento mínimo ou força). */
export class WeakPasswordError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/weak-password`

  constructor(detail?: string) {
    super(MESSAGES.weakPassword, detail)
  }
}

/** Token de reset/verificação inválido, expirado ou já consumido. */
export class InvalidResetTokenError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/invalid-reset-token`

  constructor() {
    super(MESSAGES.invalidResetToken)
  }
}

/** Sessão não encontrada (ou não pertence ao dono — anti-IDOR). */
export class SessionNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/session-not-found`

  constructor() {
    super(MESSAGES.sessionNotFound)
  }
}

/** Usuário não encontrado (ou já excluído) — admin agindo sobre id inexistente. */
export class UserNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/user-not-found`

  constructor() {
    super(MESSAGES.userNotFound)
  }
}

/** Rate-limit excedido. Carrega o tempo de espera para o header Retry-After. */
export class RateLimitedError extends DomainError {
  readonly status = 429
  readonly type = `${TYPE_BASE}/rate-limited`
  override readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(MESSAGES.rateLimited)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Link de acesso inválido, expirado ou já consumido (na configuração de senha). */
export class InvalidAccessLinkError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/invalid-access-link`

  constructor() {
    super(MESSAGES.invalidAccessLink)
  }
}

/** E-mail já pertence a um usuário (active ou pending) — colisão na criação. */
export class EmailAlreadyInUseError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/email-already-in-use`

  constructor() {
    super(MESSAGES.emailAlreadyInUse)
  }
}

/** Purge exige alvo soft-deleted — não existe hard delete direto. */
export class UserNotInTrashError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/user-not-in-trash`

  constructor() {
    super(MESSAGES.userNotInTrash)
  }
}

/** Reenvio negado: link de acesso ainda válido ou usuário não está pendente. */
export class AccessLinkNotResendableError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/access-link-not-resendable`

  constructor(detail?: string) {
    super(MESSAGES.accessLinkNotResendable, detail)
  }
}

/**
 * Ninguém registrou PROFILE_IMAGE_STORE: o módulo que guarda arquivos não está
 * instalado. Falha de configuração, não do chamador — só as operações de imagem
 * de perfil param, o resto da identidade continua funcionando.
 */
export class ProfileImageStoreMissingError extends DomainError {
  readonly status = 501
  readonly type = `${TYPE_BASE}/profile-image-store-missing`

  constructor() {
    super(
      MESSAGES.profileImageStoreMissingTitle,
      MESSAGES.profileImageStoreMissingDetail
    )
  }
}

/** Transição `setPassword` em usuário que não está pendente. */
export class InvalidAccountStateError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/invalid-account-state`

  constructor() {
    super(MESSAGES.invalidAccountState)
  }
}

/** Tentativa de encerrar o próprio dispositivo atual — logout é o caminho. */
export class CannotRevokeCurrentDeviceError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/cannot-revoke-current-device`

  constructor() {
    super(MESSAGES.cannotRevokeCurrentDevice)
  }
}

/** Set de permissões viola closure de requires ou o piso do perfil de acesso. */
export class InvalidPermissionSetError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/invalid-permission-set`

  constructor(detail?: string) {
    super(MESSAGES.invalidPermissionSet, detail)
  }
}

/** Áreas/serviços do perfil Profissional inválidos: inexistentes, inativos ou
 *  serviço fora de uma área selecionada. */
export class InvalidProfessionalScopeError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/invalid-professional-scope`

  constructor(detail?: string) {
    super(MESSAGES.invalidProfessionalScope, detail)
  }
}

/** Áreas de agendamento do perfil Agendamentos inválidas: ausentes, inexistentes ou inativas. */
export class InvalidSchedulingAreasError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/invalid-scheduling-areas`

  constructor(detail?: string) {
    super(MESSAGES.invalidSchedulingAreas, detail)
  }
}

/**
 * Tirar do atendimento a cliente quem ainda tem compromisso marcado. Recusa
 * seca (sem confirmação): a pessoa sai da escala inteira, então deixar passar
 * deixaria cliente marcado com quem o sistema não reconhece mais como executor.
 */
export class ProfessionalHasCommitmentsError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/professional-has-commitments`
  override readonly extensions: Record<string, unknown>

  constructor(commitments: readonly ProfessionalCommitmentOffender[]) {
    super(
      MESSAGES.professionalHasCommitmentsTitle,
      MESSAGES.professionalHasCommitmentsDetail
    )
    this.extensions = { commitments }
  }
}

export interface ProfessionalCommitmentOffender {
  kind: "service" | "collective"
  id: string
  name: string
  date: string
  startMinute: number
  endMinute: number
}

/** Modelo de permissões não encontrado. */
export class PermissionTemplateNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/permission-template-not-found`

  constructor() {
    super(MESSAGES.permissionTemplateNotFound)
  }
}

/** Nome de modelo já em uso (unique). */
export class PermissionTemplateNameInUseError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/permission-template-name-in-use`

  constructor() {
    super(MESSAGES.permissionTemplateNameInUse)
  }
}

/** Novo e-mail informado na troca é igual ao atual — nada a fazer. */
export class EmailUnchangedError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/email-unchanged`

  constructor() {
    super(MESSAGES.emailUnchanged)
  }
}

/** Token de confirmação de troca de e-mail inválido, expirado ou já consumido. */
export class InvalidEmailChangeTokenError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/invalid-email-change-token`

  constructor() {
    super(MESSAGES.invalidEmailChangeToken)
  }
}

/** Upload de avatar sem arquivo anexado. */
export class AvatarFileRequiredError extends DomainError {
  readonly status = 400
  readonly type = `${TYPE_BASE}/avatar-file-required`

  constructor() {
    super(MESSAGES.avatarFileRequired)
  }
}

/** Ator tentou conceder permissão que ele próprio não possui (anti-escalada). */
export class PermissionGrantNotAllowedError extends DomainError {
  readonly status = 403
  readonly type = `${TYPE_BASE}/permission-grant-not-allowed`

  constructor() {
    super(
      MESSAGES.permissionGrantNotAllowedTitle,
      MESSAGES.permissionGrantNotAllowedDetail
    )
  }
}

/**
 * Gate de hashing cheio: já há PASSWORD_HASH_MAX_IN_FLIGHT argon2 em voo.
 * 503 curto em vez de enfileirar — enfileirar troca saturação por latência
 * ilimitada, que é exatamente o que uma inundação de login procura.
 */
export class PasswordHashingSaturatedError extends DomainError {
  readonly status = 503
  readonly type = `${TYPE_BASE}/password-hashing-saturated`
  override readonly retryAfterSeconds = 2

  constructor() {
    super(
      MESSAGES.passwordHashingSaturatedTitle,
      MESSAGES.passwordHashingSaturatedDetail
    )
  }
}

/**
 * Consulta de vazamento indisponível sob `fail_closed`: a política manda
 * recusar a operação em vez de seguir sem a verificação. Nunca vira "senha
 * vazada" — o usuário não pode ser punido por uma queda do provedor.
 */
export class BreachCheckUnavailableError extends DomainError {
  readonly status = 503
  readonly type = `${TYPE_BASE}/breach-check-unavailable`
  override readonly retryAfterSeconds = 5

  constructor() {
    super(
      MESSAGES.breachCheckUnavailableTitle,
      MESSAGES.breachCheckUnavailableDetail
    )
  }
}

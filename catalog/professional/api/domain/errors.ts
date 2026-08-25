import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/professional"

/**
 * Tabela única de mensagens da entrada `professional` — title/detail de cada
 * erro. Ponto único de swap quando o produto tiver um pacote não-pt-BR; hoje
 * reproduz exatamente as strings que estes erros tinham no `identity`.
 */
const MESSAGES = {
  invalidBirthDate: "Data de nascimento inválida",
  invalidProfessionalScope: "Áreas ou serviços de atuação inválidos",
} as const

/** Data de nascimento inexistente no calendário, no futuro ou com idade acima do teto. */
export class InvalidBirthDateError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/invalid-birth-date`

  constructor() {
    super(MESSAGES.invalidBirthDate)
  }
}

/** Áreas/serviços de atuação inválidos: inexistentes, inativos ou fora das áreas. */
export class InvalidProfessionalScopeError extends DomainError {
  readonly status = 422
  readonly type = `${TYPE_BASE}/invalid-professional-scope`

  constructor(detail?: string) {
    super(MESSAGES.invalidProfessionalScope, detail)
  }
}

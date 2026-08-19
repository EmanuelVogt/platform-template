import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/audit"

/** Um produto registrou de novo uma tabela auditada ou uma coluna de FK que já
 *  tinha dono — provável colisão entre módulos, nunca um estado válido. */
export class DuplicateAuditRegistrationError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/duplicate-registration`

  constructor(name: string) {
    super(`"${name}" já está registrado na auditoria`)
  }
}

import { DomainError } from "../../kernel/errors/domain.error"

// Timeout/abort do client S3 (R2 fora do ar ou lento demais): estado
// transitório, mesmo tratamento de PoolSaturatedError mas com folga maior de
// retry — reconectar a um storage remoto custa mais que liberar um slot local.
export class StorageUnavailableError extends DomainError {
  readonly status = 503
  readonly type = "https://errors.example.com/service-unavailable"
  override readonly retryAfterSeconds = 5

  constructor() {
    super("Storage temporariamente indisponível")
  }
}

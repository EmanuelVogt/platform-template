import { DomainError } from "./domain.error"

// Saturação do pool (fila no teto ou timeout de aquisição): estado transitório,
// honesto de comunicar como 503 + Retry-After. `type` transversal como o do 403,
// sem namespace de módulo. Contadores do pool ficam só no log, nunca no corpo.
export class PoolSaturatedError extends DomainError {
  readonly status = 503
  readonly type = "https://errors.example.com/service-unavailable"
  override readonly retryAfterSeconds = 1

  constructor() {
    super("Serviço temporariamente indisponível")
  }
}

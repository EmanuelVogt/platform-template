import { DomainError } from "./domain.error"

// Estouro de bucket de rate-limit: transitório, com tempo de espera conhecido.
// `type` transversal como o do 403/503, sem namespace de módulo — o guard do
// kernel não pode carimbar um erro de um módulo de domínio. O Retry-After sai
// do `retryAfterSeconds` lido pelo ProblemDetailsFilter.
export class TooManyRequestsError extends DomainError {
  readonly status = 429
  readonly type = "https://errors.example.com/too-many-requests"
  override readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super("Muitas requisições")
    this.retryAfterSeconds = retryAfterSeconds
  }
}

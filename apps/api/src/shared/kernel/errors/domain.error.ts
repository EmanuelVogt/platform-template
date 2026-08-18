/**
 * Base de erro de domínio. Mapeado para RFC 7807 pelo ProblemDetailsFilter.
 * `throw` é o único caminho de erro — sem Result/Either.
 */
export abstract class DomainError extends Error {
  abstract readonly status: number
  abstract readonly type: string
  readonly title: string
  // Opt-in: subclasses 429 (ex.: RateLimitedError) preenchem para o Retry-After.
  // O kernel lê este campo sem importar nenhum módulo de domínio.
  readonly retryAfterSeconds?: number
  // Opt-in: membros de extensão RFC 7807 (§3.2) espalhados no corpo do problem
  // details; membros padrão (type/title/status/...) sempre vencem colisão.
  readonly extensions?: Record<string, unknown>

  constructor(title: string, detail?: string) {
    super(detail ?? title)
    this.title = title
    this.name = new.target.name
  }
}

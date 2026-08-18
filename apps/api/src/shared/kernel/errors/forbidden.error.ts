import { DomainError } from "./domain.error"

// 403 é transversal (authz do kernel), então o `type` público é único e sem
// namespace de módulo — não redeclarar por módulo (trava em error-namespace.spec).
export class ForbiddenError extends DomainError {
  readonly status = 403
  readonly type = "https://errors.example.com/forbidden"

  constructor(detail?: string) {
    super("Acesso negado", detail)
  }
}

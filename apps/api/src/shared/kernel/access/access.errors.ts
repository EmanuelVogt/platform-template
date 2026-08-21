import { DomainError } from "../errors/domain.error"

// Falha de configuração, não do chamador: sem provider de ACCESS_POLICY o
// kernel nega em vez de liberar, e o `type` distingue isso de um 403 comum.
export class AccessPolicyMissingError extends DomainError {
  readonly status = 403
  readonly type = "https://errors.example.com/access-policy-missing"

  constructor() {
    super("Acesso negado", "Nenhuma política de acesso está registrada.")
  }
}

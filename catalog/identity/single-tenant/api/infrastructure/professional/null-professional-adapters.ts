import { Injectable } from "@nestjs/common"

import type {
  ProfessionalCommitment,
  ProfessionalCommitments,
} from "../../domain/ports/professional-commitments.port"
import type { ProfessionalScope } from "../../domain/ports/professional-scope.port"

/**
 * Preenchimento do slot quando o produto não está montado (repo base sem os
 * módulos de agenda): sem service para consultar, toda área/serviço passa —
 * a obrigatoriedade de ≥1 área continua sendo do use case.
 */
@Injectable()
export class NullProfessionalScope implements ProfessionalScope {
  assertValid(): Promise<void> {
    return Promise.resolve()
  }
}

/** Sem agenda montada não existe compromisso que trave a saída do atendimento. */
@Injectable()
export class NullProfessionalCommitments implements ProfessionalCommitments {
  listFuture(): Promise<ProfessionalCommitment[]> {
    return Promise.resolve([])
  }
}

import { Module } from "@nestjs/common"

import { ProfessionalAssignmentFacade } from "./api/facades/professional-assignment.facade"
import { PROFESSIONAL_ASSIGNMENT_REPOSITORY } from "./domain/ports/professional-assignment.repository"
import { DrizzleProfessionalAssignmentRepository } from "./infrastructure/repositories/drizzle-professional-assignment.repository"

import type { Provider } from "@nestjs/common"

const PORTS: Provider[] = [
  {
    provide: PROFESSIONAL_ASSIGNMENT_REPOSITORY,
    useClass: DrizzleProfessionalAssignmentRepository,
  },
]

/**
 * Superfície leaf do identity para o vínculo profissional↔serviço (ADR 0060):
 * não importa nenhum módulo de domínio, então o ServiceModule a importa sem
 * fechar ciclo (Identity→Service já existe via ProfessionalScope).
 */
@Module({
  providers: [...PORTS, ProfessionalAssignmentFacade],
  exports: [ProfessionalAssignmentFacade],
})
export class ProfessionalAssignmentModule {}

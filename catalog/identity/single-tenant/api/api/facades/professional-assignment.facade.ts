import { Inject, Injectable } from "@nestjs/common"

import {
  PROFESSIONAL_ASSIGNMENT_REPOSITORY,
  type EnsureAreaForServiceProfessionalsInput,
  type ProfessionalAssignmentLink,
  type ProfessionalAssignmentRepository,
  type ReplaceForServiceInput,
} from "../../domain/ports/professional-assignment.repository"

import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type {
  AssignableProfessionalRow,
  SearchAssignableProfessionalsInput,
} from "../../domain/ports/user.repository"

export type { AssignableProfessionalRow } from "../../domain/ports/user.repository"

/**
 * Superfície pública do identity para o vínculo profissional↔serviço editado
 * POR SERVIÇO (Open Host Service — ADR 0034/0060). Publica fatos e escrita
 * mecânica; política (profissional atribuível, área ativa, defaults ⊆
 * vinculados) mora no consumidor. Roda na transação do chamador.
 */
@Injectable()
export class ProfessionalAssignmentFacade {
  constructor(
    @Inject(PROFESSIONAL_ASSIGNMENT_REPOSITORY)
    private readonly assignments: ProfessionalAssignmentRepository
  ) {}

  searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessionalRow>> {
    return this.assignments.searchAssignable(input)
  }

  findAssignableByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessionalRow>> {
    return this.assignments.findAssignableByIds(ids)
  }

  listByServiceIds(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>> {
    return this.assignments.listByServiceIds(serviceIds)
  }

  listServiceIdsByProfessional(userId: string): Promise<string[]> {
    return this.assignments.listServiceIdsByProfessional(userId)
  }

  listUserIdsMissingArea(
    areaId: string,
    userIds: readonly string[]
  ): Promise<string[]> {
    return this.assignments.listUserIdsMissingArea(areaId, userIds)
  }

  ensureAreaForServiceProfessionals(
    input: EnsureAreaForServiceProfessionalsInput
  ): Promise<void> {
    return this.assignments.ensureAreaForServiceProfessionals(input)
  }

  replaceForService(input: ReplaceForServiceInput): Promise<void> {
    return this.assignments.replaceForService(input)
  }

  removeByServiceIds(serviceIds: readonly string[]): Promise<void> {
    return this.assignments.removeByServiceIds(serviceIds)
  }
}

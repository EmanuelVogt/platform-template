import type {
  AssignableProfessionalRow,
  SearchAssignableProfessionalsInput,
} from "./user.repository"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"

export interface ProfessionalAssignmentLink {
  userId: string
  isDefault: boolean
}

export interface ReplaceForServiceInput {
  serviceId: string
  areaId: string
  links: readonly ProfessionalAssignmentLink[]
}

export interface EnsureAreaForServiceProfessionalsInput {
  areaId: string
  serviceIds: readonly string[]
}

/**
 * Vínculo profissional↔serviço/área editado POR SERVIÇO. Leitura e escrita
 * mecânicas; validações de negócio moram no consumidor (ADR 0060).
 */
export interface ProfessionalAssignmentRepository {
  searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessionalRow>>
  findAssignableByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessionalRow>>
  listByServiceIds(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>>
  listServiceIdsByProfessional(userId: string): Promise<string[]>
  listUserIdsMissingArea(
    areaId: string,
    userIds: readonly string[]
  ): Promise<string[]>
  ensureAreaForServiceProfessionals(
    input: EnsureAreaForServiceProfessionalsInput
  ): Promise<void>
  replaceForService(input: ReplaceForServiceInput): Promise<void>
  removeByServiceIds(serviceIds: readonly string[]): Promise<void>
}

export const PROFESSIONAL_ASSIGNMENT_REPOSITORY = Symbol(
  "PROFESSIONAL_ASSIGNMENT_REPOSITORY"
)

import type {
  AssignableProfessionalRow,
  ProfessionalAssignmentLink,
  SearchAssignableProfessionalsInput,
} from "./professional-assignment.repository"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"

/**
 * Leitura do diretório de profissionais atribuíveis. Port LOCAL da entrada
 * (AD-014): as consultas que antes moravam no `UserRepository` do identity
 * saíram com o recorte (AD-035) — `serves_clients` não é mais coluna de
 * `identity.users`, então quem responde por "atribuível" é esta entrada.
 */
export interface ProfessionalDirectoryReader {
  existsActive(userId: string): Promise<boolean>
  searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessionalRow>>
  findAssignableByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessionalRow>>
  listActive(): Promise<AssignableProfessionalRow[]>
  listActiveByArea(areaId: string): Promise<AssignableProfessionalRow[]>
  findAreaIdsByUserIds(
    userIds: readonly string[]
  ): Promise<Map<string, readonly string[]>>
  findActiveIdsByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, string[]>>
  findActiveLinksByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>>
}

export const PROFESSIONAL_DIRECTORY_READER = Symbol(
  "PROFESSIONAL_DIRECTORY_READER"
)

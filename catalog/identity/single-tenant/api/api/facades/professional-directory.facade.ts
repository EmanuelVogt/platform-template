import { Inject, Injectable } from "@nestjs/common"

import {
  USER_REPOSITORY,
  type AssignableProfessionalLink,
  type SearchAssignableProfessionalsInput,
  type UserRepository,
} from "../../domain/ports/user.repository"

import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"

export interface AssignableProfessional {
  id: string
  name: string
  email: string
  avatarAttachmentId: string | null
}

/**
 * Superfície pública do identity consumida por outros módulos: diretório de
 * profissionais atribuíveis. Publica fatos sobre `identity.users`; a política fica
 * no consumidor (ex.: activity). Roda na transação do chamador. Ver ADR 0034.
 */
@Injectable()
export class ProfessionalDirectoryFacade {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository
  ) {}

  isActiveProfessional(userId: string): Promise<boolean> {
    return this.users.existsActiveProfessional(userId)
  }

  searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessional>> {
    return this.users.searchAssignableProfessionals(input)
  }

  findByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessional>> {
    return this.users.findProfessionalsByIds([...ids])
  }

  listActive(): Promise<AssignableProfessional[]> {
    return this.users.listActiveProfessionals()
  }

  listActiveByArea(areaId: string): Promise<AssignableProfessional[]> {
    return this.users.listActiveProfessionalsByArea(areaId)
  }

  findAreaIdsByProfessionalIds(
    userIds: readonly string[]
  ): Promise<Map<string, readonly string[]>> {
    return this.users.findProfessionalAreaIdsByUserIds([...userIds])
  }

  findActiveProfessionalIdsByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, string[]>> {
    return this.users.findActiveProfessionalIdsByServices([...serviceIds])
  }

  findActiveProfessionalLinksByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, AssignableProfessionalLink[]>> {
    return this.users.findActiveProfessionalLinksByServices([...serviceIds])
  }
}

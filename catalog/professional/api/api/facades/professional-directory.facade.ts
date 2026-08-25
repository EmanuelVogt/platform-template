import { Inject, Injectable } from "@nestjs/common"

import {
  PROFESSIONAL_DIRECTORY_READER,
  type ProfessionalDirectoryReader,
} from "../../domain/ports/professional-directory.reader"

import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type {
  ProfessionalAssignmentLink,
  SearchAssignableProfessionalsInput,
} from "../../domain/ports/professional-assignment.repository"

export interface AssignableProfessional {
  id: string
  name: string
  email: string
  avatarAttachmentId: string | null
}

/**
 * Superfície pública da entrada consumida por outros módulos: diretório de
 * profissionais atribuíveis. Publica fatos; a política fica no consumidor.
 * Roda na transação do chamador. Ver ADR 0034.
 *
 * Depois do corte do agregado (AD-035) estas leituras não moram mais no
 * `UserRepository` do identity: quem sabe quem atende cliente é esta entrada.
 */
@Injectable()
export class ProfessionalDirectoryFacade {
  constructor(
    @Inject(PROFESSIONAL_DIRECTORY_READER)
    private readonly directory: ProfessionalDirectoryReader
  ) {}

  isActiveProfessional(userId: string): Promise<boolean> {
    return this.directory.existsActive(userId)
  }

  searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessional>> {
    return this.directory.searchAssignable(input)
  }

  findByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessional>> {
    return this.directory.findAssignableByIds(ids)
  }

  listActive(): Promise<AssignableProfessional[]> {
    return this.directory.listActive()
  }

  listActiveByArea(areaId: string): Promise<AssignableProfessional[]> {
    return this.directory.listActiveByArea(areaId)
  }

  findAreaIdsByProfessionalIds(
    userIds: readonly string[]
  ): Promise<Map<string, readonly string[]>> {
    return this.directory.findAreaIdsByUserIds(userIds)
  }

  findActiveProfessionalIdsByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, string[]>> {
    return this.directory.findActiveIdsByServices(serviceIds)
  }

  findActiveProfessionalLinksByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>> {
    return this.directory.findActiveLinksByServices(serviceIds)
  }
}

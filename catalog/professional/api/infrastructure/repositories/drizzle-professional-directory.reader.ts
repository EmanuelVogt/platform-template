import { Injectable } from "@nestjs/common"
import { and, asc, eq, inArray } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { UserDirectoryFacade } from "../../../identity/api/facades/user-directory.facade"
import {
  servesClientsFilter,
  servesClientsUserIds,
  toAssignableProfessionalRow,
} from "../professional-query.helpers"
import { professionalProfile } from "../tables/professional-profile.table"
import { userProfessionalAreas } from "../tables/user-professional-area.table"
import { userProfessionalServices } from "../tables/user-professional-service.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type {
  AssignableProfessionalRow,
  ProfessionalAssignmentLink,
  SearchAssignableProfessionalsInput,
} from "../../domain/ports/professional-assignment.repository"
import type { ProfessionalDirectoryReader } from "../../domain/ports/professional-directory.reader"

type ServiceLinkRow = {
  serviceId: string
  userId: string
  isDefault: boolean
}

/**
 * Adapter drizzle do diretório. "Atribuível" tem dois donos depois do corte do
 * agregado (AD-035): o recorte (`serves_clients`) sai de
 * `professional.professional_profile`, que é desta entrada, e o estado da conta
 * (ativo, não excluído) mais as colunas do usuário saem do identity pela
 * `UserDirectoryFacade`. As tabelas daqui mantêm a FK física para
 * `identity.users`; nenhuma LEITURA daqui seleciona coluna de lá.
 */
@Injectable()
export class DrizzleProfessionalDirectoryReader implements ProfessionalDirectoryReader {
  constructor(
    private readonly tx: TransactionManager,
    private readonly identityUsers: UserDirectoryFacade
  ) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async existsActive(userId: string): Promise<boolean> {
    const candidates = await servesClientsUserIds(this.db, [userId])
    const rows = await this.identityUsers.listActiveByIds(candidates)
    return rows.length > 0
  }

  async searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessionalRow>> {
    const candidates = await servesClientsUserIds(this.db)
    const page = await this.identityUsers.searchActive({
      ids: candidates,
      q: input.q,
      page: input.page,
      pageSize: input.pageSize,
    })
    return { ...page, data: page.data.map(toAssignableProfessionalRow) }
  }

  async findAssignableByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessionalRow>> {
    if (ids.length === 0) return new Map()
    const candidates = await servesClientsUserIds(this.db, ids)
    const rows = await this.identityUsers.listActiveByIds(candidates)
    return new Map(rows.map((r) => [r.id, toAssignableProfessionalRow(r)]))
  }

  async listActive(): Promise<AssignableProfessionalRow[]> {
    const candidates = await servesClientsUserIds(this.db)
    const rows = await this.identityUsers.listActiveByIds(candidates)
    return rows.map(toAssignableProfessionalRow)
  }

  async listActiveByArea(areaId: string): Promise<AssignableProfessionalRow[]> {
    const links = await this.db
      .select({ userId: userProfessionalAreas.userId })
      .from(userProfessionalAreas)
      .innerJoin(
        professionalProfile,
        and(
          eq(professionalProfile.userId, userProfessionalAreas.userId),
          servesClientsFilter()
        )
      )
      .where(eq(userProfessionalAreas.areaId, areaId))
    const rows = await this.identityUsers.listActiveByIds(
      links.map((link) => link.userId)
    )
    return rows.map(toAssignableProfessionalRow)
  }

  async findAreaIdsByUserIds(
    userIds: readonly string[]
  ): Promise<Map<string, readonly string[]>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db
      .select({
        userId: userProfessionalAreas.userId,
        areaId: userProfessionalAreas.areaId,
      })
      .from(userProfessionalAreas)
      .where(inArray(userProfessionalAreas.userId, [...userIds]))
      .orderBy(
        asc(userProfessionalAreas.userId),
        asc(userProfessionalAreas.areaId)
      )
    const groupedAreaIds = new Map<string, string[]>()
    for (const row of rows) {
      const areaIds = groupedAreaIds.get(row.userId) ?? []
      areaIds.push(row.areaId)
      groupedAreaIds.set(row.userId, areaIds)
    }
    return groupedAreaIds
  }

  async findActiveIdsByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>()
    for (const row of await this.activeLinkRows(serviceIds)) {
      const ids = map.get(row.serviceId) ?? []
      ids.push(row.userId)
      map.set(row.serviceId, ids)
    }
    return map
  }

  async findActiveLinksByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>> {
    const map = new Map<string, ProfessionalAssignmentLink[]>()
    for (const row of await this.activeLinkRows(serviceIds)) {
      const links = map.get(row.serviceId) ?? []
      links.push({ userId: row.userId, isDefault: row.isDefault })
      map.set(row.serviceId, links)
    }
    return map
  }

  /**
   * Vínculos dos serviços cujo profissional atende cliente (recorte daqui) E
   * cuja conta está ativa e viva (estado que o identity responde). A ordem é a
   * do banco, como antes: nenhum consumidor depende dela.
   */
  private async activeLinkRows(
    serviceIds: readonly string[]
  ): Promise<ServiceLinkRow[]> {
    if (serviceIds.length === 0) return []
    const rows = await this.db
      .select({
        serviceId: userProfessionalServices.serviceId,
        userId: userProfessionalServices.userId,
        isDefault: userProfessionalServices.isDefault,
      })
      .from(userProfessionalServices)
      .innerJoin(
        professionalProfile,
        and(
          eq(professionalProfile.userId, userProfessionalServices.userId),
          servesClientsFilter()
        )
      )
      .where(inArray(userProfessionalServices.serviceId, [...serviceIds]))
    const active = await this.identityUsers.listActiveByIds([
      ...new Set(rows.map((row) => row.userId)),
    ])
    const activeIds = new Set(active.map((row) => row.id))
    return rows.filter((row) => activeIds.has(row.userId))
  }
}

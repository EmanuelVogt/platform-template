import { Injectable } from "@nestjs/common"
import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { buildListingClauses } from "../../../../shared/kernel/listing/apply-listing"
import { toPaginated } from "../../../../shared/kernel/listing/paginated"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { users } from "../../../identity/infrastructure/tables/user.table"
import {
  ASSIGNABLE_LISTING_CONFIG,
  assignableProfessionalFilters,
  assignableProfessionalJoin,
  assignableProfessionalSelection,
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

/**
 * Adapter drizzle do diretório. Toda consulta junta
 * `professional.professional_profile` ao `identity.users`: é de lá que
 * `serves_clients` responde depois do corte do agregado (AD-035).
 */
@Injectable()
export class DrizzleProfessionalDirectoryReader implements ProfessionalDirectoryReader {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async existsActive(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(and(eq(users.id, userId), ...assignableProfessionalFilters()))
      .limit(1)
    return rows.length > 0
  }

  async searchAssignable(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessionalRow>> {
    const { where, orderBy, limit, offset } = buildListingClauses(
      input,
      ASSIGNABLE_LISTING_CONFIG,
      assignableProfessionalFilters()
    )
    const rows = await this.db
      .select(assignableProfessionalSelection)
      .from(users)
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    const counted = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(where)
    return toPaginated(
      rows.map(toAssignableProfessionalRow),
      counted[0]?.n ?? 0,
      input.page,
      input.pageSize
    )
  }

  async findAssignableByIds(
    ids: readonly string[]
  ): Promise<Map<string, AssignableProfessionalRow>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select(assignableProfessionalSelection)
      .from(users)
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(
        and(inArray(users.id, [...ids]), ...assignableProfessionalFilters())
      )
    return new Map(rows.map((r) => [r.id, toAssignableProfessionalRow(r)]))
  }

  async listActive(): Promise<AssignableProfessionalRow[]> {
    const rows = await this.db
      .select(assignableProfessionalSelection)
      .from(users)
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(and(...assignableProfessionalFilters()))
      .orderBy(asc(users.name))
    return rows.map(toAssignableProfessionalRow)
  }

  async listActiveByArea(areaId: string): Promise<AssignableProfessionalRow[]> {
    const rows = await this.db
      .select(assignableProfessionalSelection)
      .from(users)
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .innerJoin(
        userProfessionalAreas,
        eq(userProfessionalAreas.userId, users.id)
      )
      .where(
        and(
          eq(userProfessionalAreas.areaId, areaId),
          ...assignableProfessionalFilters()
        )
      )
      .orderBy(asc(users.name))
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
    if (serviceIds.length === 0) return new Map()
    const rows = await this.db
      .select({
        serviceId: userProfessionalServices.serviceId,
        userId: users.id,
      })
      .from(userProfessionalServices)
      .innerJoin(users, eq(users.id, userProfessionalServices.userId))
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(
        and(
          inArray(userProfessionalServices.serviceId, [...serviceIds]),
          ...assignableProfessionalFilters()
        )
      )
    const map = new Map<string, string[]>()
    for (const row of rows) {
      const ids = map.get(row.serviceId) ?? []
      ids.push(row.userId)
      map.set(row.serviceId, ids)
    }
    return map
  }

  async findActiveLinksByServices(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>> {
    if (serviceIds.length === 0) return new Map()
    const rows = await this.db
      .select({
        serviceId: userProfessionalServices.serviceId,
        userId: users.id,
        isDefault: userProfessionalServices.isDefault,
      })
      .from(userProfessionalServices)
      .innerJoin(users, eq(users.id, userProfessionalServices.userId))
      .innerJoin(professionalProfile, assignableProfessionalJoin())
      .where(
        and(
          inArray(userProfessionalServices.serviceId, [...serviceIds]),
          ...assignableProfessionalFilters()
        )
      )
    const map = new Map<string, ProfessionalAssignmentLink[]>()
    for (const row of rows) {
      const links = map.get(row.serviceId) ?? []
      links.push({ userId: row.userId, isDefault: row.isDefault })
      map.set(row.serviceId, links)
    }
    return map
  }
}

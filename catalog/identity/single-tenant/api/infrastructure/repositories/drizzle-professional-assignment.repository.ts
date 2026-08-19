import { Injectable } from "@nestjs/common"
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"

import { buildListingClauses } from "../../../../shared/kernel/listing/apply-listing"
import { toPaginated } from "../../../../shared/kernel/listing/paginated"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import {
  ASSIGNABLE_LISTING_CONFIG,
  assignableProfessionalFilters,
  assignableProfessionalSelection,
  toAssignableProfessionalRow,
} from "../professional-query.helpers"
import { userProfessionalAreas } from "../tables/user-professional-area.table"
import { userProfessionalServices } from "../tables/user-professional-service.table"
import { users } from "../tables/user.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type {
  ProfessionalAssignmentLink,
  ProfessionalAssignmentRepository,
  EnsureAreaForServiceProfessionalsInput,
  ReplaceForServiceInput,
} from "../../domain/ports/professional-assignment.repository"
import type {
  AssignableProfessionalRow,
  SearchAssignableProfessionalsInput,
} from "../../domain/ports/user.repository"

@Injectable()
export class DrizzleProfessionalAssignmentRepository
  implements ProfessionalAssignmentRepository
{
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
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
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    const counted = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
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
      .where(
        and(inArray(users.id, [...ids]), ...assignableProfessionalFilters())
      )
    return new Map(rows.map((r) => [r.id, toAssignableProfessionalRow(r)]))
  }

  async listByServiceIds(
    serviceIds: readonly string[]
  ): Promise<Map<string, ProfessionalAssignmentLink[]>> {
    const map = new Map<string, ProfessionalAssignmentLink[]>()
    if (serviceIds.length === 0) return map
    const rows = await this.db
      .select({
        serviceId: userProfessionalServices.serviceId,
        userId: userProfessionalServices.userId,
        isDefault: userProfessionalServices.isDefault,
      })
      .from(userProfessionalServices)
      .where(inArray(userProfessionalServices.serviceId, [...serviceIds]))
      .orderBy(
        asc(userProfessionalServices.createdAt),
        asc(userProfessionalServices.userId)
      )
    for (const row of rows) {
      const list = map.get(row.serviceId) ?? []
      list.push({ userId: row.userId, isDefault: row.isDefault })
      map.set(row.serviceId, list)
    }
    return map
  }

  async listServiceIdsByProfessional(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ serviceId: userProfessionalServices.serviceId })
      .from(userProfessionalServices)
      .where(eq(userProfessionalServices.userId, userId))
    return rows.map((r) => r.serviceId)
  }

  async listUserIdsMissingArea(
    areaId: string,
    userIds: readonly string[]
  ): Promise<string[]> {
    if (userIds.length === 0) return []
    const rows = await this.db
      .select({ userId: userProfessionalAreas.userId })
      .from(userProfessionalAreas)
      .where(
        and(
          eq(userProfessionalAreas.areaId, areaId),
          inArray(userProfessionalAreas.userId, [...userIds])
        )
      )
    const have = new Set(rows.map((r) => r.userId))
    return userIds.filter((id) => !have.has(id))
  }

  async ensureAreaForServiceProfessionals(
    input: EnsureAreaForServiceProfessionalsInput
  ): Promise<void> {
    const serviceIds = [...new Set(input.serviceIds)]
    if (serviceIds.length === 0) return
    const rows = await this.db
      .selectDistinct({ userId: userProfessionalServices.userId })
      .from(userProfessionalServices)
      .leftJoin(
        userProfessionalAreas,
        and(
          eq(userProfessionalAreas.userId, userProfessionalServices.userId),
          eq(userProfessionalAreas.areaId, input.areaId)
        )
      )
      .where(
        and(
          inArray(userProfessionalServices.serviceId, serviceIds),
          isNull(userProfessionalAreas.userId)
        )
      )
    if (rows.length === 0) return
    await this.db
      .insert(userProfessionalAreas)
      .values(rows.map(({ userId }) => ({ userId, areaId: input.areaId })))
      .onConflictDoNothing()
  }

  async replaceForService(input: ReplaceForServiceInput): Promise<void> {
    const userIds = input.links.map((l) => l.userId)
    await this.db
      .delete(userProfessionalServices)
      .where(
        userIds.length === 0
          ? eq(userProfessionalServices.serviceId, input.serviceId)
          : and(
              eq(userProfessionalServices.serviceId, input.serviceId),
              notInArray(userProfessionalServices.userId, userIds)
            )
      )
    if (userIds.length === 0) return
    // Upsert preserva o created_at dos vínculos mantidos.
    await this.db
      .insert(userProfessionalServices)
      .values(
        input.links.map((l) => ({
          userId: l.userId,
          serviceId: input.serviceId,
          isDefault: l.isDefault,
        }))
      )
      .onConflictDoUpdate({
        target: [
          userProfessionalServices.userId,
          userProfessionalServices.serviceId,
        ],
        set: { isDefault: sql`excluded.is_default` },
      })
    const missing = await this.listUserIdsMissingArea(input.areaId, userIds)
    if (missing.length > 0) {
      await this.db
        .insert(userProfessionalAreas)
        .values(missing.map((userId) => ({ userId, areaId: input.areaId })))
    }
  }

  async removeByServiceIds(serviceIds: readonly string[]): Promise<void> {
    if (serviceIds.length === 0) return
    await this.db
      .delete(userProfessionalServices)
      .where(inArray(userProfessionalServices.serviceId, [...serviceIds]))
  }
}

import { Injectable } from "@nestjs/common"
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import {
  buildListingClauses,
  escapeLike,
  type ListingConfig,
} from "../../../../shared/kernel/listing/apply-listing"
import { toPaginated } from "../../../../shared/kernel/listing/paginated"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../domain/entities/user.entity"
import { EmailAlreadyInUseError } from "../../domain/errors"
import { userPermissions } from "../tables/user-permission.table"
import { userProfessionalAreas } from "../tables/user-professional-area.table"
import { userProfessionalServices } from "../tables/user-professional-service.table"
import { userSchedulingAreas } from "../tables/user-scheduling-area.table"
import { users, type UserRow } from "../tables/user.table"
import { verificationTokens } from "../tables/verification-token.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { PermissionKey } from "../../domain/permissions/permission-catalog"
import type {
  ListUsersInput,
  NotificationTarget,
  UserListRow,
  UserRepository,
} from "../../domain/ports/user.repository"

/**
 * Allowlist de ordenação + colunas de busca + ordenação default + desempate por
 * PK (`users.id`) da listagem admin. As chaves de `sortable` espelham o enum
 * `sort` do contrato (`listUsersQuerySchema`).
 */
const LIST_CONFIG: ListingConfig = {
  sortable: {
    name: users.name,
    email: users.email,
    createdAt: users.createdAt,
    deletedAt: users.deletedAt,
  },
  searchable: [users.name, users.email],
  defaultSort: { key: "createdAt", order: "desc" },
  tiebreaker: users.id,
}

// Hard gate do soft delete: predicado único das leituras de APRESENTAÇÃO (list,
// findVisibleById). findByEmail/findById ficam fora dele de propósito — são
// leituras de INTEGRIDADE (unique-email, login, reativação) e precisam ver o
// soft-deleted. Ver ADR de soft delete.
const visible = isNull(users.deletedAt)

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, ids))
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  async findIdsByNameLike(term: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(ilike(users.name, `%${escapeLike(term)}%`))
      .limit(500)
    return rows.map((r) => r.id)
  }

  async findNotificationTargetsByPermission(
    permission: PermissionKey
  ): Promise<NotificationTarget[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(
        and(
          eq(users.status, "active"),
          visible,
          or(
            eq(users.accessProfile, "master"),
            exists(
              this.db
                .select({ one: sql`1` })
                .from(userPermissions)
                .where(
                  and(
                    eq(userPermissions.userId, users.id),
                    eq(userPermissions.permission, permission)
                  )
                )
            )
          )
        )
      )
      .orderBy(asc(users.name))
    return rows
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    const [row] = rows
    if (!row) return null
    return this.toEntity(row)
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    const [row] = rows
    if (!row) return null
    return this.toEntity(row)
  }

  async findByIdForUpdate(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .for("update")
    const [row] = rows
    if (!row) return null
    return this.toEntity(row)
  }

  async findVisibleById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), visible))
      .limit(1)
    const [row] = rows
    if (!row) return null
    return this.toEntity(row)
  }

  async findByIdWithPermissions(
    id: string
  ): Promise<{ user: User; permissions: readonly PermissionKey[] } | null> {
    const rows = await this.db
      .select({ user: users, permission: userPermissions.permission })
      .from(users)
      .leftJoin(userPermissions, eq(userPermissions.userId, users.id))
      .where(eq(users.id, id))
    const [row] = rows
    if (!row) return null
    const permissions = rows
      .map((r) => r.permission)
      .filter((p): p is string => p !== null) as PermissionKey[]
    return { user: this.toEntity(row.user), permissions }
  }

  async findPermissions(userId: string): Promise<readonly PermissionKey[]> {
    const rows = await this.db
      .select({ permission: userPermissions.permission })
      .from(userPermissions)
      .where(eq(userPermissions.userId, userId))
    return rows.map((r) => r.permission) as PermissionKey[]
  }

  async replacePermissions(
    userId: string,
    permissions: readonly PermissionKey[]
  ): Promise<void> {
    await this.db
      .delete(userPermissions)
      .where(eq(userPermissions.userId, userId))
    if (permissions.length === 0) return
    await this.db
      .insert(userPermissions)
      .values(permissions.map((permission) => ({ userId, permission })))
  }

  async findProfessionalScope(
    userId: string
  ): Promise<{ areaIds: readonly string[]; serviceIds: readonly string[] }> {
    const [areaRows, serviceRows] = await Promise.all([
      this.db
        .select({ areaId: userProfessionalAreas.areaId })
        .from(userProfessionalAreas)
        .where(eq(userProfessionalAreas.userId, userId)),
      this.db
        .select({ serviceId: userProfessionalServices.serviceId })
        .from(userProfessionalServices)
        .where(eq(userProfessionalServices.userId, userId)),
    ])
    return {
      areaIds: areaRows.map((r) => r.areaId),
      serviceIds: serviceRows.map((r) => r.serviceId),
    }
  }

  async findProfessionalAreaIdsByUserIds(
    userIds: string[]
  ): Promise<Map<string, readonly string[]>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db
      .select({
        userId: userProfessionalAreas.userId,
        areaId: userProfessionalAreas.areaId,
      })
      .from(userProfessionalAreas)
      .where(inArray(userProfessionalAreas.userId, userIds))
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

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select()
      .from(users)
      .where(inArray(users.id, ids))
    return rows.map((row) => this.toEntity(row))
  }

  async findStaleEmailChanges(now: Date): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(
          isNotNull(users.pendingEmail),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(verificationTokens)
              .where(
                and(
                  eq(verificationTokens.userId, users.id),
                  eq(verificationTokens.type, "email_change"),
                  isNull(verificationTokens.consumedAt),
                  gt(verificationTokens.expiresAt, now)
                )
              )
          )
        )
      )
    return rows.map((row) => this.toEntity(row))
  }

  async hardDeleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db.delete(users).where(inArray(users.id, ids))
  }

  async insert(user: User): Promise<void> {
    const p = user.props
    try {
      await this.db.insert(users).values({
        id: p.id,
        name: p.name,
        email: p.email,
        emailVerified: p.emailVerified,
        pendingEmail: p.pendingEmail,
        accessProfile: p.accessProfile,
        status: p.status,
        passwordHash: p.passwordHash,
        pepperVersion: p.pepperVersion,
        failedLoginAttempts: p.failedLoginAttempts,
        lockedUntil: p.lockedUntil,
        lastResetRequestedAt: p.lastResetRequestedAt,
        lastVerificationRequestedAt: p.lastVerificationRequestedAt,
        lastEmailChangeRequestedAt: p.lastEmailChangeRequestedAt,
        avatarAttachmentId: p.avatarAttachmentId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        deletedAt: p.deletedAt,
        createdByUserId: p.createdByUserId,
      })
    } catch (error) {
      // Race entre findByEmail e insert (READ COMMITTED): o unique index do email
      // fecha a janela no banco; traduzir a violação pro erro de domínio (409, não
      // 500 cru do driver). email é a única constraint única além do PK (ulid).
      if (isUniqueViolation(error)) {
        throw new EmailAlreadyInUseError()
      }
      throw error
    }
  }

  async update(user: User): Promise<void> {
    const p = user.props
    await this.db
      .update(users)
      .set({
        name: p.name,
        email: p.email,
        emailVerified: p.emailVerified,
        pendingEmail: p.pendingEmail,
        accessProfile: p.accessProfile,
        status: p.status,
        passwordHash: p.passwordHash,
        pepperVersion: p.pepperVersion,
        failedLoginAttempts: p.failedLoginAttempts,
        lockedUntil: p.lockedUntil,
        lastResetRequestedAt: p.lastResetRequestedAt,
        lastVerificationRequestedAt: p.lastVerificationRequestedAt,
        lastEmailChangeRequestedAt: p.lastEmailChangeRequestedAt,
        avatarAttachmentId: p.avatarAttachmentId,
        updatedAt: new Date(),
        deletedAt: p.deletedAt,
      })
      .where(eq(users.id, p.id))
  }

  async registerFailedAttempt(
    userId: string,
    now: Date,
    threshold: number,
    durationSeconds: number
  ): Promise<User | null> {
    // FOR UPDATE serializa tentativas concorrentes do mesmo user: o incremento
    // não sofre lost-update e a trava vê o contador final. A regra mora na
    // entidade — o SQL só garante atomicidade.
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update")
    const [row] = rows
    if (!row) {
      return null
    }
    const updated = this.toEntity(row).registerFailedAttempt(
      now,
      threshold,
      durationSeconds
    )
    await this.db
      .update(users)
      .set({
        failedLoginAttempts: updated.props.failedLoginAttempts,
        lockedUntil: updated.props.lockedUntil,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    return updated
  }

  async list(input: ListUsersInput): Promise<PaginatedResult<UserListRow>> {
    const filters: SQL[] = [
      input.deleted === true ? isNotNull(users.deletedAt) : visible,
    ]
    if (input.emailVerified !== undefined) {
      filters.push(eq(users.emailVerified, input.emailVerified))
    }
    if (input.status !== undefined) {
      filters.push(eq(users.status, input.status))
    }
    const { where, orderBy, limit, offset } = buildListingClauses(
      input,
      LIST_CONFIG,
      filters
    )
    const rows = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    const counted = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(where)

    const entities = rows.map((row) => this.toEntity(row))
    const pendingIds = entities
      .filter((u) => u.props.status === "pending")
      .map((u) => u.props.id)
    const accessLinkByUser = await this.latestAccessLinkByUser(pendingIds)
    const permissionRows = entities.length
      ? await this.db
          .select({
            userId: userPermissions.userId,
            permission: userPermissions.permission,
          })
          .from(userPermissions)
          .where(
            inArray(
              userPermissions.userId,
              entities.map((u) => u.props.id)
            )
          )
      : []
    const permissionsByUser = new Map<string, PermissionKey[]>()
    for (const row of permissionRows) {
      const list = permissionsByUser.get(row.userId) ?? []
      list.push(row.permission as PermissionKey)
      permissionsByUser.set(row.userId, list)
    }
    const userIds = entities.map((u) => u.props.id)
    const areaRows = userIds.length
      ? await this.db
          .select({
            userId: userProfessionalAreas.userId,
            areaId: userProfessionalAreas.areaId,
          })
          .from(userProfessionalAreas)
          .where(inArray(userProfessionalAreas.userId, userIds))
      : []
    const serviceRows = userIds.length
      ? await this.db
          .select({
            userId: userProfessionalServices.userId,
            serviceId: userProfessionalServices.serviceId,
          })
          .from(userProfessionalServices)
          .where(inArray(userProfessionalServices.userId, userIds))
      : []
    const schedulingAreaRows = userIds.length
      ? await this.db
          .select({
            userId: userSchedulingAreas.userId,
            areaId: userSchedulingAreas.areaId,
          })
          .from(userSchedulingAreas)
          .where(inArray(userSchedulingAreas.userId, userIds))
      : []
    const areasByUser = new Map<string, string[]>()
    for (const row of areaRows) {
      const list = areasByUser.get(row.userId) ?? []
      list.push(row.areaId)
      areasByUser.set(row.userId, list)
    }
    const servicesByUser = new Map<string, string[]>()
    for (const row of serviceRows) {
      const list = servicesByUser.get(row.userId) ?? []
      list.push(row.serviceId)
      servicesByUser.set(row.userId, list)
    }
    const schedulingAreasByUser = new Map<string, string[]>()
    for (const row of schedulingAreaRows) {
      const list = schedulingAreasByUser.get(row.userId) ?? []
      list.push(row.areaId)
      schedulingAreasByUser.set(row.userId, list)
    }
    const now = new Date()
    const data: UserListRow[] = entities.map((user) => {
      const permissions = permissionsByUser.get(user.props.id) ?? []
      const areaIds = areasByUser.get(user.props.id) ?? []
      const serviceIds = servicesByUser.get(user.props.id) ?? []
      const schedulingAreaIds = schedulingAreasByUser.get(user.props.id) ?? []
      if (user.props.status !== "pending") {
        return {
          user,
          accessLinkExpiresAt: null,
          accessLinkExpired: false,
          permissions,
          areaIds,
          serviceIds,
          schedulingAreaIds,
        }
      }
      const token = accessLinkByUser.get(user.props.id)
      const expiresAt =
        token?.consumedAt === null && token.expiresAt.getTime() > now.getTime()
          ? token.expiresAt
          : null
      return {
        user,
        accessLinkExpiresAt: expiresAt,
        accessLinkExpired: expiresAt === null,
        permissions,
        areaIds,
        serviceIds,
        schedulingAreaIds,
      }
    })

    return toPaginated(data, counted[0]?.n ?? 0, input.page, input.pageSize)
  }

  /** Último token 'access_link' por user (mapa userId → {expiresAt, consumedAt}). */
  private async latestAccessLinkByUser(
    userIds: string[]
  ): Promise<Map<string, { expiresAt: Date; consumedAt: Date | null }>> {
    const map = new Map<string, { expiresAt: Date; consumedAt: Date | null }>()
    if (userIds.length === 0) return map
    const rows = await this.db
      .select({
        userId: verificationTokens.userId,
        expiresAt: verificationTokens.expiresAt,
        consumedAt: verificationTokens.consumedAt,
      })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.type, "access_link"),
          inArray(verificationTokens.userId, userIds)
        )
      )
      .orderBy(desc(verificationTokens.createdAt))
    // Primeiro por user (orderBy desc createdAt) é o mais recente.
    for (const row of rows) {
      if (!map.has(row.userId)) {
        map.set(row.userId, {
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
        })
      }
    }
    return map
  }

  private toEntity(row: UserRow): User {
    return User.fromProps({
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      pendingEmail: row.pendingEmail,
      accessProfile: row.accessProfile,
      status: row.status,
      passwordHash: row.passwordHash,
      pepperVersion: row.pepperVersion,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
      lastResetRequestedAt: row.lastResetRequestedAt,
      lastVerificationRequestedAt: row.lastVerificationRequestedAt,
      lastEmailChangeRequestedAt: row.lastEmailChangeRequestedAt,
      avatarAttachmentId: row.avatarAttachmentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      createdByUserId: row.createdByUserId,
    })
  }
}

/** Violação de unique constraint do Postgres (pg error code 23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  )
}

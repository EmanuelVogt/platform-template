import { Injectable } from "@nestjs/common"
import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm"

import { isUniqueViolation } from "../../../../shared/kernel/database/pg-errors"
import {
  buildListingClauses,
  type ListingConfig,
} from "../../../../shared/kernel/listing/apply-listing"
import { toPaginated } from "../../../../shared/kernel/listing/paginated"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Tag } from "../../domain/entities/tag.entity"
import { TagConflictError } from "../../domain/errors"
import { tags, type TagRow } from "../tables/tag.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { TagProps } from "../../domain/entities/tag.entity"
import type {
  LinkableTagRef,
  ListTagsInput,
  TagListRow,
  TagRepository,
  TagView,
} from "../../domain/ports/tag.repository"

const LIST_CONFIG: ListingConfig = {
  sortable: {
    name: tags.name,
    createdAt: tags.createdAt,
  },
  searchable: [tags.name],
  defaultSort: { key: "name", order: "asc" },
  tiebreaker: tags.id,
}

const visible = isNull(tags.deletedAt)

@Injectable()
export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async insert(tag: Tag): Promise<void> {
    const p = tag.props
    try {
      await this.db.insert(tags).values({
        id: p.id,
        name: p.name,
        color: p.color,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        deletedAt: p.deletedAt,
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new TagConflictError()
      throw error
    }
  }

  async save(tag: Tag): Promise<void> {
    const p = tag.props
    try {
      await this.db
        .update(tags)
        .set({
          name: p.name,
          color: p.color,
          isActive: p.isActive,
          updatedAt: p.updatedAt,
          deletedAt: p.deletedAt,
        })
        .where(eq(tags.id, p.id))
    } catch (error) {
      if (isUniqueViolation(error)) throw new TagConflictError()
      throw error
    }
  }

  async findById(id: string): Promise<Tag | null> {
    const rows = await this.db.select().from(tags).where(eq(tags.id, id)).limit(1)
    return rows[0] ? Tag.fromProps(toProps(rows[0])) : null
  }

  async findByIds(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) return []
    const rows = await this.db.select().from(tags).where(inArray(tags.id, ids))
    return rows.map((row) => Tag.fromProps(toProps(row)))
  }

  async findViewById(id: string): Promise<TagView | null> {
    const rows = await this.db
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), visible))
      .limit(1)
    return rows[0] ? toView(rows[0]) : null
  }

  async list(input: ListTagsInput): Promise<PaginatedResult<TagListRow>> {
    const filters: SQL[] = [
      input.deleted === true ? isNotNull(tags.deletedAt) : visible,
    ]
    if (input.isActive !== undefined) {
      filters.push(eq(tags.isActive, input.isActive))
    }
    const { where, orderBy, limit, offset } = buildListingClauses(
      input,
      LIST_CONFIG,
      filters
    )

    const rows = await this.db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        isActive: tags.isActive,
        createdAt: tags.createdAt,
        deletedAt: tags.deletedAt,
      })
      .from(tags)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)

    const counted = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tags)
      .where(where)

    return toPaginated(rows, counted[0]?.n ?? 0, input.page, input.pageSize)
  }

  async hardDeleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db.delete(tags).where(inArray(tags.id, ids))
  }

  async existingLiveIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await this.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, ids), visible))
    return new Set(rows.map((r) => r.id))
  }

  async describeByIds(ids: string[]): Promise<Map<string, LinkableTagRef>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(and(inArray(tags.id, ids), visible))
    return new Map(rows.map((r) => [r.id, r]))
  }

  async listLinkableRefs(): Promise<LinkableTagRef[]> {
    return this.db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(and(visible, eq(tags.isActive, true)))
      .orderBy(tags.name)
  }
}

function toProps(row: TagRow): TagProps {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

function toView(row: TagRow): TagView {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

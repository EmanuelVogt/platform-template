import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { Tag } from "../entities/tag.entity"

export interface TagView {
  id: string
  name: string
  color: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface TagListRow {
  id: string
  name: string
  color: string | null
  isActive: boolean
  createdAt: Date
  deletedAt: Date | null
}

export interface ListTagsInput {
  page: number
  pageSize: number
  q?: string
  sort?: "name" | "createdAt"
  order?: "asc" | "desc"
  isActive?: boolean
  deleted?: boolean
}

export interface LinkableTagRef {
  id: string
  name: string
  color: string | null
}

export interface TagRepository {
  insert(tag: Tag): Promise<void>
  save(tag: Tag): Promise<void>
  findById(id: string): Promise<Tag | null>
  findByIds(ids: string[]): Promise<Tag[]>
  findViewById(id: string): Promise<TagView | null>
  list(input: ListTagsInput): Promise<PaginatedResult<TagListRow>>
  hardDeleteByIds(ids: string[]): Promise<void>
  /** Subconjunto dos ids vivos (fora da lixeira). */
  existingLiveIds(ids: string[]): Promise<Set<string>>
  /** Nome e cor das tags vivas — hidratação de views dos consumidores. */
  describeByIds(ids: string[]): Promise<Map<string, LinkableTagRef>>
  /** Tags vivas+ativas ordenadas por nome — seletor dos forms consumidores. */
  listLinkableRefs(): Promise<LinkableTagRef[]>
}

export const TAG_REPOSITORY: unique symbol = Symbol("TagRepository")

import type { TagListRow, TagView } from "../domain/ports/tag.repository"

export type TagViewOutput = {
  id: string
  name: string
  color: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type TagUsageOutput = {
  total: number
}

export type TagListItemView = {
  id: string
  name: string
  color: string | null
  isActive: boolean
  usage: TagUsageOutput
  createdAt: string
  deletedAt: string | null
}

export function toTagView(view: TagView): TagViewOutput {
  return {
    id: view.id,
    name: view.name,
    color: view.color,
    isActive: view.isActive,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    deletedAt: view.deletedAt ? view.deletedAt.toISOString() : null,
  }
}

export function toTagListItemView(
  row: TagListRow,
  usageTotal: number
): TagListItemView {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: row.isActive,
    usage: { total: usageTotal },
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}

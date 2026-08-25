import { Tag } from "../domain/entities/tag.entity"

import type { TagProps } from "../domain/entities/tag.entity"

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z")

/** Tag pronta pra spec: só o que o teste muda entra em `over`. */
export function makeTag(over: Partial<TagProps> = {}): Tag {
  return Tag.fromProps({
    id: "tag-1",
    name: "Relaxante",
    color: "#aa5641",
    isActive: true,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    deletedAt: null,
    ...over,
  })
}

import type { UpdateTagInput as EntityUpdateTagInput } from "../../../domain/entities/tag.entity"

export type UpdateTagInput = {
  id: string
  data: EntityUpdateTagInput
}

import { createZodDto } from "nestjs-zod"
import { z } from "zod"

import {
  baseListingQuerySchema,
  zBoolQuery,
} from "../../../../shared/kernel/listing/listing-query.schema"
import { makePaginatedSchema } from "../../../../shared/kernel/listing/paginated"

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/, "Cor inválida.")

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(60),
  color: colorSchema.nullable().optional(),
  isActive: z.boolean().optional().default(true),
})
export class CreateTagDto extends createZodDto(createTagSchema) {}

export const updateTagSchema = createTagSchema
export class UpdateTagDto extends createZodDto(updateTagSchema) {}

export const tagIdParamsSchema = z.object({ id: z.string().min(1) })
export class TagIdParamsDto extends createZodDto(tagIdParamsSchema) {}

export const listTagsQuerySchema = baseListingQuerySchema.extend({
  sort: z.enum(["name", "createdAt"]).optional(),
  isActive: zBoolQuery.optional(),
  deleted: zBoolQuery.optional(),
})
export class ListTagsQueryDto extends createZodDto(listTagsQuerySchema) {}
export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>

export const tagUsageSchema = z.object({
  total: z.number().int(),
})

export const tagListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  isActive: z.boolean(),
  usage: tagUsageSchema,
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
})
export const listTagsResponseSchema = makePaginatedSchema(tagListItemSchema)
export class ListTagsResponseDto extends createZodDto(listTagsResponseSchema) {}

export const tagViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
})
export class TagViewDto extends createZodDto(tagViewSchema) {}

export const linkableTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
})
export const linkableTagsResponseSchema = z.array(linkableTagSchema)
export class LinkableTagsResponseDto extends createZodDto(
  linkableTagsResponseSchema
) {}

export const tagIdsSchema = z.object({
  tagIds: z
    .array(z.string().min(1))
    .min(1, "Informe ao menos uma tag.")
    .max(100),
})
export class TagIdsDto extends createZodDto(tagIdsSchema) {}

export const restoreTagsResponseSchema = z.object({
  restored: z.number().int(),
})
export class RestoreTagsResponseDto extends createZodDto(
  restoreTagsResponseSchema
) {}

export const purgeTagsResponseSchema = z.object({ purged: z.number().int() })
export class PurgeTagsResponseDto extends createZodDto(
  purgeTagsResponseSchema
) {}

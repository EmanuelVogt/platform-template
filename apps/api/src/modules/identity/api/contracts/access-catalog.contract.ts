import { createZodDto } from "nestjs-zod"
import { z } from "zod"

import { permissionKeySchema } from "./identity.contract"

const permissionDefSchema = z.object({
  key: permissionKeySchema,
  label: z.string(),
  requires: z.array(permissionKeySchema),
})

const featureDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  permissions: z.array(permissionDefSchema),
})

const moduleDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  features: z.array(featureDefSchema),
})

const accessProfileDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  assignable: z.boolean(),
})

export const accessCatalogResponseSchema = z.object({
  modules: z.array(moduleDefSchema),
  profiles: z.array(accessProfileDefSchema),
})

export class AccessCatalogResponseDto extends createZodDto(
  accessCatalogResponseSchema
) {}
export type AccessCatalogResponse = z.infer<typeof accessCatalogResponseSchema>

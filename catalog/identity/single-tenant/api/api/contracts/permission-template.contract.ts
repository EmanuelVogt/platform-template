import { createZodDto } from "nestjs-zod"
import { z } from "zod"

import { permissionSetSchema } from "./identity.contract"

export const permissionTemplateViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: permissionSetSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const permissionTemplateBodySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório.").max(80),
  description: z.string().trim().max(280).nullable().default(null),
  // Modelo é agnóstico de perfil: closure valida no use case; piso NÃO se aplica (spec, regra 3).
  permissions: permissionSetSchema.refine(
    (p) => p.length > 0,
    "Selecione ao menos uma permissão."
  ),
})

export const permissionTemplateParamsSchema = z.object({
  id: z.string().min(1),
})

export const listPermissionTemplatesResponseSchema = z.object({
  templates: z.array(permissionTemplateViewSchema),
})
export const permissionTemplateResponseSchema = z.object({
  template: permissionTemplateViewSchema,
})

export class PermissionTemplateBodyDto extends createZodDto(
  permissionTemplateBodySchema
) {}
export class PermissionTemplateParamsDto extends createZodDto(
  permissionTemplateParamsSchema
) {}
export class ListPermissionTemplatesResponseDto extends createZodDto(
  listPermissionTemplatesResponseSchema
) {}
export class PermissionTemplateResponseDto extends createZodDto(
  permissionTemplateResponseSchema
) {}

export type PermissionTemplateView = z.infer<
  typeof permissionTemplateViewSchema
>
export type PermissionTemplateBody = z.infer<
  typeof permissionTemplateBodySchema
>

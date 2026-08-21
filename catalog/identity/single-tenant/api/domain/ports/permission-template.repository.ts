import type { PermissionTemplate } from "../entities/permission-template.entity"

export interface PermissionTemplateRepository {
  findById(id: string): Promise<PermissionTemplate | null>
  findByName(name: string): Promise<PermissionTemplate | null>
  /** Lista completa ordenada por nome (poucos registros; sem paginação por desenho). */
  listAll(): Promise<PermissionTemplate[]>
  insert(template: PermissionTemplate): Promise<void>
  /** UPDATE da linha + replace do set de permissões na mesma tx do caller. */
  update(template: PermissionTemplate): Promise<void>
  deleteById(id: string): Promise<void>
}

export const PERMISSION_TEMPLATE_REPOSITORY: unique symbol = Symbol(
  "PermissionTemplateRepository"
)

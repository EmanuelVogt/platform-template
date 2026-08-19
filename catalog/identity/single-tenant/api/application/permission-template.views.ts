import type { PermissionTemplateView } from "../api/contracts/permission-template.contract"
import type { PermissionTemplate } from "../domain/entities/permission-template.entity"

export function toPermissionTemplateView(
  t: PermissionTemplate
): PermissionTemplateView {
  return {
    id: t.props.id,
    name: t.props.name,
    description: t.props.description,
    permissions: [...t.props.permissions],
    createdAt: t.props.createdAt.toISOString(),
    updatedAt: t.props.updatedAt.toISOString(),
  }
}

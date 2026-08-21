import type { PermissionTemplateView } from "../../../api/contracts/permission-template.contract"
import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

export type UpdatePermissionTemplateInput = {
  id: string
  name: string
  description: string | null
  permissions: PermissionKey[]
}
export type UpdatePermissionTemplateOutput = {
  template: PermissionTemplateView
}

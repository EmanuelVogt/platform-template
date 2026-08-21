import type { PermissionTemplateView } from "../../../api/contracts/permission-template.contract"
import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

export type CreatePermissionTemplateInput = {
  name: string
  description: string | null
  permissions: PermissionKey[]
}
export type CreatePermissionTemplateOutput = {
  template: PermissionTemplateView
}

import type { AssignableAccessProfile } from "../../../domain/access/permission.types"
import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

export type UpdateUserInput = {
  userId: string
  name: string
  accessProfile: AssignableAccessProfile
  permissions: PermissionKey[]
}

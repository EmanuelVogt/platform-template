import type { AssignableAccessProfile } from "../../../domain/access/permission.types"
import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

export type CreateUserInput = {
  name: string
  email: string
  accessProfile: AssignableAccessProfile
  permissions: PermissionKey[]
}

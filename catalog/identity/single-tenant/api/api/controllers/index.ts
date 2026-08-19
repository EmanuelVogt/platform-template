import { ACCESS_CATALOG_CONTROLLERS } from "./access-catalog"
import { ADMIN_CONTROLLERS } from "./admin"
import { AUTH_CONTROLLERS } from "./auth"
import { DEVICE_CONTROLLERS } from "./device"
import { PERMISSION_TEMPLATE_CONTROLLERS } from "./permission-template"
import { SESSION_CONTROLLERS } from "./session"

export const CONTROLLERS = [
  ...AUTH_CONTROLLERS,
  ...SESSION_CONTROLLERS,
  ...DEVICE_CONTROLLERS,
  ...ADMIN_CONTROLLERS,
  ...PERMISSION_TEMPLATE_CONTROLLERS,
  ...ACCESS_CATALOG_CONTROLLERS,
]

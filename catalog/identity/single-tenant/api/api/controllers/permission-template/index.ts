import { CreatePermissionTemplateController } from "./create-permission-template.controller"
import { DeletePermissionTemplateController } from "./delete-permission-template.controller"
import { GetPermissionTemplateController } from "./get-permission-template.controller"
import { ListPermissionTemplatesController } from "./list-permission-templates.controller"
import { UpdatePermissionTemplateController } from "./update-permission-template.controller"

/** Modelos de permissão (admin). Um controller por rota, padrão do módulo. */
export const PERMISSION_TEMPLATE_CONTROLLERS = [
  ListPermissionTemplatesController,
  GetPermissionTemplateController,
  CreatePermissionTemplateController,
  UpdatePermissionTemplateController,
  DeletePermissionTemplateController,
]

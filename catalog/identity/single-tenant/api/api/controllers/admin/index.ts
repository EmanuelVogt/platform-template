import { CreateUserController } from "./create-user.controller"
import { DeleteUserController } from "./delete-user.controller"
import { ListUsersController } from "./list-users.controller"
import { PurgeUsersController } from "./purge-users.controller"
import { ResendAccessLinkController } from "./resend-access-link.controller"
import { RestoreUsersController } from "./restore-users.controller"
import { UpdateUserController } from "./update-user.controller"

/** Rotas administrativas (gated por permissão). Agrupadas para extração futura barata. */
export const ADMIN_CONTROLLERS = [
  ListUsersController,
  CreateUserController,
  UpdateUserController,
  DeleteUserController,
  RestoreUsersController,
  PurgeUsersController,
  ResendAccessLinkController,
]

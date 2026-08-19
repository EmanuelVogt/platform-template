import { CreateTagController } from "./create-tag.controller"
import { DeleteTagController } from "./delete-tag.controller"
import { GetTagController } from "./get-tag.controller"
import { ListLinkableTagsController } from "./list-linkable-tags.controller"
import { ListTagsController } from "./list-tags.controller"
import { PurgeTagsController } from "./purge-tags.controller"
import { RestoreTagsController } from "./restore-tags.controller"
import { UpdateTagController } from "./update-tag.controller"

// Rota estática antes da paramétrica de mesmo método: `linkable` antes do
// @Get(":id") e `purge` antes do @Delete(":id") — senão o param sombreia (404).
export const TAG_CONTROLLERS = [
  ListTagsController,
  ListLinkableTagsController,
  GetTagController,
  CreateTagController,
  UpdateTagController,
  PurgeTagsController,
  DeleteTagController,
  RestoreTagsController,
]

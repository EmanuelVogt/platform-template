import { Module } from "@nestjs/common"

import { CONTROLLERS } from "./api/controllers"
import { TagDirectoryFacade } from "./api/facades/tag-directory.facade"
import { TagUsageRegistry } from "./application/tag-usage.registry"
import { CreateTagUseCase } from "./application/use-cases/create-tag/create-tag.use-case"
import { GetTagUseCase } from "./application/use-cases/get-tag/get-tag.use-case"
import { ListTagsUseCase } from "./application/use-cases/list-tags/list-tags.use-case"
import { PurgeTagsUseCase } from "./application/use-cases/purge-tags/purge-tags.use-case"
import { RestoreTagsUseCase } from "./application/use-cases/restore-tags/restore-tags.use-case"
import { StashTagUseCase } from "./application/use-cases/stash-tag/stash-tag.use-case"
import { UpdateTagUseCase } from "./application/use-cases/update-tag/update-tag.use-case"
import { TAG_REPOSITORY } from "./domain/ports/tag.repository"
import { DrizzleTagRepository } from "./infrastructure/repositories/drizzle-tag.repository"

import type { Provider } from "@nestjs/common"

const PORTS: Provider[] = [{ provide: TAG_REPOSITORY, useClass: DrizzleTagRepository }]

const USE_CASES = [
  CreateTagUseCase,
  GetTagUseCase,
  ListTagsUseCase,
  UpdateTagUseCase,
  StashTagUseCase,
  RestoreTagsUseCase,
  PurgeTagsUseCase,
]

@Module({
  controllers: CONTROLLERS,
  providers: [...PORTS, ...USE_CASES, TagUsageRegistry, TagDirectoryFacade],
  exports: [TagUsageRegistry, TagDirectoryFacade],
})
export class TagModule {}

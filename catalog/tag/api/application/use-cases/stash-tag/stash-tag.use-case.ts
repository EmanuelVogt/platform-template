import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { TagNotFoundError } from "../../../domain/errors"
import { TAG_REPOSITORY, type TagRepository } from "../../../domain/ports/tag.repository"

import type { StashTagInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class StashTagUseCase implements UseCaseContract<StashTagInput, void> {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  @Transactional()
  @Traced({ name: "tag.stashTag" })
  async execute(input: StashTagInput): Promise<void> {
    const tag = await this.tags.findById(input.id)
    if (!tag || tag.isDeleted()) throw new TagNotFoundError()
    await this.tags.save(tag.stash(new Date()))
  }
}

import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { TAG_REPOSITORY, type TagRepository } from "../../../domain/ports/tag.repository"

import type { RestoreTagsInput, RestoreTagsOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class RestoreTagsUseCase
  implements UseCaseContract<RestoreTagsInput, RestoreTagsOutput>
{
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  @Transactional()
  @Traced({ name: "tag.restoreTags" })
  async execute(input: RestoreTagsInput): Promise<RestoreTagsOutput> {
    const found = await this.tags.findByIds(input.tagIds)
    const stashed = found.filter((tag) => tag.isDeleted())
    const now = new Date()
    for (const tag of stashed) {
      await this.tags.save(tag.restore(now))
    }
    return { restored: stashed.length }
  }
}

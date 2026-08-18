import { Inject } from "@nestjs/common"

import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { TagPurged } from "../../../api/events/tag-purged.event"
import { TagNotInTrashError } from "../../../domain/errors"
import { TAG_REPOSITORY, type TagRepository } from "../../../domain/ports/tag.repository"

import type { PurgeTagsInput, PurgeTagsOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class PurgeTagsUseCase
  implements UseCaseContract<PurgeTagsInput, PurgeTagsOutput>
{
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
    private readonly outbox: OutboxPublisher
  ) {}

  @Transactional()
  @Traced({ name: "tag.purgeTags" })
  async execute(input: PurgeTagsInput): Promise<PurgeTagsOutput> {
    const found = await this.tags.findByIds(input.tagIds)
    if (found.some((tag) => !tag.isDeleted())) throw new TagNotInTrashError()
    const ids = found.map((tag) => tag.props.id)
    if (ids.length === 0) return { purged: 0 }
    await this.tags.hardDeleteByIds(ids)
    await this.outbox.publish(TagPurged.from({ tagIds: ids }))
    return { purged: ids.length }
  }
}

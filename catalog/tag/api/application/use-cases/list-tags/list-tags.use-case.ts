import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  TAG_REPOSITORY,
  type ListTagsInput,
  type TagRepository,
} from "../../../domain/ports/tag.repository"
import { TagUsageRegistry } from "../../tag-usage.registry"
import { toTagListItemView } from "../../views"

import type { ListTagsOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListTagsUseCase implements UseCaseContract<ListTagsInput, ListTagsOutput> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
    private readonly usage: TagUsageRegistry
  ) {}

  @ReadOnly()
  @Traced({ name: "tag.listTags" })
  async execute(input: ListTagsInput): Promise<ListTagsOutput> {
    const { data, page } = await this.tags.list(input)
    const totals = await this.usage.totalsFor(data.map((row) => row.id))
    return {
      data: data.map((row) => toTagListItemView(row, totals.get(row.id) ?? 0)),
      page,
    }
  }
}

import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { TagNotFoundError } from "../../../domain/errors"
import { TAG_REPOSITORY, type TagRepository } from "../../../domain/ports/tag.repository"
import { toTagView, type TagViewOutput } from "../../views"

import type { GetTagInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class GetTagUseCase implements UseCaseContract<GetTagInput, TagViewOutput> {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  @ReadOnly()
  @Traced({ name: "tag.getTag" })
  async execute(input: GetTagInput): Promise<TagViewOutput> {
    const view = await this.tags.findViewById(input.id)
    if (!view) throw new TagNotFoundError()
    return toTagView(view)
  }
}

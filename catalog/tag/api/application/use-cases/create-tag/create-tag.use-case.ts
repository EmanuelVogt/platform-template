import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { Tag } from "../../../domain/entities/tag.entity"
import { TagNotFoundError } from "../../../domain/errors"
import { TAG_REPOSITORY, type TagRepository } from "../../../domain/ports/tag.repository"
import { toTagView, type TagViewOutput } from "../../views"

import type { CreateTagUseCaseInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class CreateTagUseCase
  implements UseCaseContract<CreateTagUseCaseInput, TagViewOutput>
{
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  @Transactional()
  @Traced({ name: "tag.createTag" })
  async execute(input: CreateTagUseCaseInput): Promise<TagViewOutput> {
    const tag = Tag.create(input)
    await this.tags.insert(tag)
    const view = await this.tags.findViewById(tag.props.id)
    if (!view) throw new TagNotFoundError()
    return toTagView(view)
  }
}

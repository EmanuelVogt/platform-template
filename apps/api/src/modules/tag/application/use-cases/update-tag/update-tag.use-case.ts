import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { TagNotFoundError } from "../../../domain/errors"
import { TAG_REPOSITORY, type TagRepository } from "../../../domain/ports/tag.repository"
import { toTagView, type TagViewOutput } from "../../views"

import type { UpdateTagInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class UpdateTagUseCase
  implements UseCaseContract<UpdateTagInput, TagViewOutput>
{
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  @Transactional()
  @Traced({ name: "tag.updateTag" })
  async execute(input: UpdateTagInput): Promise<TagViewOutput> {
    const existing = await this.tags.findById(input.id)
    if (!existing || existing.isDeleted()) throw new TagNotFoundError()
    await this.tags.save(existing.update(input.data, new Date()))
    const view = await this.tags.findViewById(input.id)
    if (!view) throw new TagNotFoundError()
    return toTagView(view)
  }
}

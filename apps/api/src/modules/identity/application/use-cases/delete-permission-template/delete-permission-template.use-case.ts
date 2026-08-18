import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { PermissionTemplateNotFoundError } from "../../../domain/errors"
import {
  PERMISSION_TEMPLATE_REPOSITORY,
  type PermissionTemplateRepository,
} from "../../../domain/ports/permission-template.repository"

import type { DeletePermissionTemplateInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class DeletePermissionTemplateUseCase
  implements UseCaseContract<DeletePermissionTemplateInput, void>
{
  constructor(
    @Inject(PERMISSION_TEMPLATE_REPOSITORY)
    private readonly templates: PermissionTemplateRepository
  ) {}

  @Transactional()
  @Traced({ name: "identity.deletePermissionTemplate" })
  async execute(input: DeletePermissionTemplateInput): Promise<void> {
    const existing = await this.templates.findById(input.id)
    if (!existing) {
      throw new PermissionTemplateNotFoundError()
    }
    // Sem FK com usuário — delete livre (semântica detached da spec).
    await this.templates.deleteById(input.id)
  }
}

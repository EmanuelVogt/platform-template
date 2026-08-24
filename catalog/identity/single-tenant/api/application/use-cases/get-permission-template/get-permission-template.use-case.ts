import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { PermissionTemplateNotFoundError } from "../../../domain/errors"
import {
  PERMISSION_TEMPLATE_REPOSITORY,
  type PermissionTemplateRepository,
} from "../../../domain/ports/permission-template.repository"
import { toPermissionTemplateView } from "../../permission-template.views"

import type {
  GetPermissionTemplateInput,
  GetPermissionTemplateOutput,
} from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class GetPermissionTemplateUseCase implements UseCaseContract<
  GetPermissionTemplateInput,
  GetPermissionTemplateOutput
> {
  constructor(
    @Inject(PERMISSION_TEMPLATE_REPOSITORY)
    private readonly templates: PermissionTemplateRepository
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.getPermissionTemplate" })
  async execute(
    input: GetPermissionTemplateInput
  ): Promise<GetPermissionTemplateOutput> {
    const template = await this.templates.findById(input.id)
    if (!template) {
      throw new PermissionTemplateNotFoundError()
    }
    return { template: toPermissionTemplateView(template) }
  }
}

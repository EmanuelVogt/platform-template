import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { PermissionTemplate } from "../../../domain/entities/permission-template.entity"
import { PermissionTemplateNameInUseError } from "../../../domain/errors"
import {
  PERMISSION_TEMPLATE_REPOSITORY,
  type PermissionTemplateRepository,
} from "../../../domain/ports/permission-template.repository"
import { assertValidPermissionSet } from "../../access-policy"
import { toPermissionTemplateView } from "../../permission-template.views"

import type {
  CreatePermissionTemplateInput,
  CreatePermissionTemplateOutput,
} from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class CreatePermissionTemplateUseCase implements UseCaseContract<
  CreatePermissionTemplateInput,
  CreatePermissionTemplateOutput
> {
  constructor(
    @Inject(PERMISSION_TEMPLATE_REPOSITORY)
    private readonly templates: PermissionTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  @Transactional()
  @Traced({ name: "identity.createPermissionTemplate" })
  async execute(
    input: CreatePermissionTemplateInput
  ): Promise<CreatePermissionTemplateOutput> {
    assertValidPermissionSet(input.permissions)
    if (await this.templates.findByName(input.name.trim())) {
      throw new PermissionTemplateNameInUseError()
    }
    const template = PermissionTemplate.create(input, this.clock.now())
    await this.templates.insert(template)
    return { template: toPermissionTemplateView(template) }
  }
}

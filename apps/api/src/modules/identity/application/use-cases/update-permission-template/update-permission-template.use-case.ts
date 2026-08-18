import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  PermissionTemplateNameInUseError,
  PermissionTemplateNotFoundError,
} from "../../../domain/errors"
import {
  PERMISSION_TEMPLATE_REPOSITORY,
  type PermissionTemplateRepository,
} from "../../../domain/ports/permission-template.repository"
import { assertValidPermissionSet } from "../../access-policy"
import { toPermissionTemplateView } from "../../permission-template.views"

import type {
  UpdatePermissionTemplateInput,
  UpdatePermissionTemplateOutput,
} from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class UpdatePermissionTemplateUseCase
  implements
    UseCaseContract<UpdatePermissionTemplateInput, UpdatePermissionTemplateOutput>
{
  constructor(
    @Inject(PERMISSION_TEMPLATE_REPOSITORY)
    private readonly templates: PermissionTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  @Transactional()
  @Traced({ name: "identity.updatePermissionTemplate" })
  async execute(
    input: UpdatePermissionTemplateInput
  ): Promise<UpdatePermissionTemplateOutput> {
    assertValidPermissionSet(input.permissions)
    const existing = await this.templates.findById(input.id)
    if (!existing) {
      throw new PermissionTemplateNotFoundError()
    }
    const sameName = await this.templates.findByName(input.name.trim())
    if (sameName && sameName.props.id !== input.id) {
      throw new PermissionTemplateNameInUseError()
    }
    const updated = existing.update(input, this.clock.now())
    await this.templates.update(updated)
    return { template: toPermissionTemplateView(updated) }
  }
}

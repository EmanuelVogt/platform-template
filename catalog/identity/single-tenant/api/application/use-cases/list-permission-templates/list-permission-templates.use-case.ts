import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  PERMISSION_TEMPLATE_REPOSITORY,
  type PermissionTemplateRepository,
} from "../../../domain/ports/permission-template.repository"
import { toPermissionTemplateView } from "../../permission-template.views"

import type { ListPermissionTemplatesOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListPermissionTemplatesUseCase
  implements UseCaseContract<void, ListPermissionTemplatesOutput>
{
  constructor(
    @Inject(PERMISSION_TEMPLATE_REPOSITORY)
    private readonly templates: PermissionTemplateRepository
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.listPermissionTemplates" })
  async execute(): Promise<ListPermissionTemplatesOutput> {
    const all = await this.templates.listAll()
    return { templates: all.map(toPermissionTemplateView) }
  }
}

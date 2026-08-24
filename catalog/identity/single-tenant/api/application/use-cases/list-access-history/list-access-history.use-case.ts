import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import { requireAuth } from "../../require-auth"
import { toAccessHistoryItemView } from "../../views"

import { ACCESS_HISTORY_EVENT_TYPES } from "./types"

import type { ListAccessHistoryInput, ListAccessHistoryOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListAccessHistoryUseCase implements UseCaseContract<
  ListAccessHistoryInput,
  ListAccessHistoryOutput
> {
  constructor(
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.listAccessHistory" })
  async execute(
    input: ListAccessHistoryInput
  ): Promise<ListAccessHistoryOutput> {
    const { userId } = requireAuth(this.ctx)
    const result = await this.authEvents.listByUser(
      userId,
      input,
      ACCESS_HISTORY_EVENT_TYPES
    )
    return { data: result.data.map(toAccessHistoryItemView), page: result.page }
  }
}

import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { SessionNotFoundError } from "../../../domain/errors"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { requireAuth } from "../../require-auth"
import { toUserView } from "../../views"

import type { GetCurrentUserInput, GetCurrentUserOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class GetCurrentUserUseCase
  implements UseCaseContract<GetCurrentUserInput, GetCurrentUserOutput>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly ctx: RequestContext,
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.getCurrentUser" })
  async execute(_input: GetCurrentUserInput): Promise<GetCurrentUserOutput> {
    const { userId } = requireAuth(this.ctx)
    // isDeleted preserva o hard gate do findVisibleById: sessão de usuário
    // soft-deleted cai no 404 neutro e desloga.
    const found = await this.users.findByIdWithPermissions(userId)
    if (!found || found.user.isDeleted()) {
      throw new SessionNotFoundError()
    }
    return { user: toUserView(found.user, found.permissions) }
  }
}

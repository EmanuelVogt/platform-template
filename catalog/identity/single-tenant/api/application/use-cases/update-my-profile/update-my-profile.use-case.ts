import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { requireAuth } from "../../require-auth"

import type { UpdateMyProfileInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/** Edição self-service do próprio nome e data de nascimento. */
@UseCase()
export class UpdateMyProfileUseCase implements UseCaseContract<
  UpdateMyProfileInput,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext
  ) {}

  @Transactional()
  @Traced({ name: "identity.updateMyProfile" })
  async execute(input: UpdateMyProfileInput): Promise<void> {
    const ctx = requireAuth(this.ctx)
    const now = this.clock.now()
    const user = await this.users.findById(ctx.userId)
    if (!user) {
      throw new ForbiddenError()
    }
    await this.users.update(
      user.updateOwnProfile(
        { name: input.name, birthDate: input.birthDate },
        now
      )
    )
  }
}

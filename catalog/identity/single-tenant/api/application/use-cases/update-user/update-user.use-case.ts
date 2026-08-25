import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { UserNotFoundError } from "../../../domain/errors"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { resolveUserAccess } from "../../access-policy"
import { IDENTITY_ACCESS } from "../../identity-context"

import type { UpdateUserInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/** Erro único da auto-edição — mesmo `type` (403 forbidden) das duas regras. */
class SelfEditError extends ForbiddenError {
  constructor() {
    super("Não é possível alterar o próprio perfil de acesso ou permissões.")
  }
}

@UseCase()
export class UpdateUserUseCase implements UseCaseContract<
  UpdateUserInput,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext
  ) {}

  @Transactional()
  @Traced({ name: "identity.updateUser" })
  async execute(input: UpdateUserInput): Promise<void> {
    const found = await this.users.findByIdWithPermissions(input.userId)
    if (!found || found.user.isDeleted()) {
      throw new UserNotFoundError()
    }
    const { user, permissions: current } = found
    if (user.isMaster()) {
      throw new ForbiddenError("Não é possível editar o usuário master.")
    }

    if (user.props.id === this.ctx.getActor()?.id) {
      const sameProfile = user.props.accessProfile === input.accessProfile
      const sameSet =
        current.length === input.permissions.length &&
        new Set(input.permissions).size ===
          new Set([...input.permissions, ...current]).size
      if (!sameProfile || !sameSet) {
        throw new SelfEditError()
      }
    }

    const actorAccess = this.ctx.getExtension(IDENTITY_ACCESS)
    if (actorAccess === undefined) {
      throw new ForbiddenError()
    }
    const access = resolveUserAccess(input, { actor: actorAccess, current })

    await this.users.update(
      user.updateProfile(
        {
          name: input.name,
          accessProfile: input.accessProfile,
        },
        this.clock.now()
      )
    )
    await this.users.replacePermissions(user.props.id, access.permissions)
  }
}

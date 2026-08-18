import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  ProfessionalHasCommitmentsError,
  UserNotFoundError,
} from "../../../domain/errors"
import {
  PROFESSIONAL_COMMITMENTS,
  type ProfessionalCommitments,
} from "../../../domain/ports/professional-commitments.port"
import {
  PROFESSIONAL_SCOPE,
  type ProfessionalScope,
} from "../../../domain/ports/professional-scope.port"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { resolveUserAccess } from "../../access-policy"

import type { UpdateUserInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class UpdateUserUseCase
  implements UseCaseContract<UpdateUserInput, void>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(PROFESSIONAL_SCOPE) private readonly scope: ProfessionalScope,
    @Inject(PROFESSIONAL_COMMITMENTS)
    private readonly commitments: ProfessionalCommitments
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

    const store = this.ctx.get()
    if (user.props.id === store.userId) {
      const sameProfile = user.props.accessProfile === input.accessProfile
      const sameSet =
        current.length === input.permissions.length &&
        new Set(input.permissions).size ===
          new Set([...input.permissions, ...current]).size
      if (!sameProfile || !sameSet) {
        throw new ForbiddenError(
          "Não é possível alterar o próprio perfil de acesso ou permissões."
        )
      }
    }

    if (store.access === null) {
      throw new ForbiddenError()
    }
    await this.assertCanStopAttending(user.props.id, {
      was: user.props.servesClients,
      now: input.servesClients,
    })
    const access = await resolveUserAccess(input, this.scope, {
      actor: store.access,
      current,
    })

    await this.users.update(
      user.updateProfile(
        {
          name: input.name,
          accessProfile: input.accessProfile,
          servesClients: input.servesClients,
        },
        this.clock.now()
      )
    )
    await this.users.replacePermissions(user.props.id, access.permissions)
    await this.users.replaceProfessionalAreas(user.props.id, access.areaIds)
    await this.users.replaceProfessionalServices(user.props.id, access.serviceIds)
    await this.users.replaceSchedulingAreas(user.props.id, access.schedulingAreaIds)
  }

  private async assertCanStopAttending(
    userId: string,
    attendance: { was: boolean; now: boolean }
  ): Promise<void> {
    if (!attendance.was || attendance.now) return
    const pending = await this.commitments.listFuture(userId)
    if (pending.length > 0) {
      throw new ProfessionalHasCommitmentsError(pending)
    }
  }
}

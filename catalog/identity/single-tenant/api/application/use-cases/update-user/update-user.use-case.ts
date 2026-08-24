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
import { IDENTITY_ACCESS } from "../../identity-context"

import type { UpdateUserInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"
import type { User } from "../../../domain/entities/user.entity"

/** Erro único da auto-edição — mesmo `type` (403 forbidden) das duas regras. */
class SelfEditError extends ForbiddenError {
  constructor() {
    super(
      "Não é possível alterar o próprio perfil de acesso, permissões ou escopo."
    )
  }
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set([...a, ...b]).size === new Set(a).size

@UseCase()
export class UpdateUserUseCase implements UseCaseContract<
  UpdateUserInput,
  void
> {
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

    if (user.props.id === this.ctx.getActor()?.id) {
      const sameProfile = user.props.accessProfile === input.accessProfile
      const sameSet =
        current.length === input.permissions.length &&
        new Set(input.permissions).size ===
          new Set([...input.permissions, ...current]).size
      if (!sameProfile || !sameSet) {
        throw new SelfEditError()
      }
      await this.assertNoSelfScopeChange(user, input)
    }

    const actorAccess = this.ctx.getExtension(IDENTITY_ACCESS)
    if (actorAccess === undefined) {
      throw new ForbiddenError()
    }
    await this.assertCanStopAttending(user.props.id, {
      was: user.props.servesClients,
      now: input.servesClients,
    })
    const access = await resolveUserAccess(input, this.scope, {
      actor: actorAccess,
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
    await this.users.replaceProfessionalServices(
      user.props.id,
      access.serviceIds
    )
    await this.users.replaceSchedulingAreas(
      user.props.id,
      access.schedulingAreaIds
    )
  }

  /**
   * O próprio escopo também não se auto-edita: marcar-se como atendente ou
   * ampliar áreas/serviços/áreas restritas por perfil é decisão de outro ator com
   * permissão, nunca do dono da conta. Master não passa por aqui — editar o
   * usuário master já é recusado acima.
   *
   * SPEC_DEVIATION: para `schedulingAreaIds` a regra é "auto-edição não carrega
   * essa área", não "não pode mudar".
   * Reason: o port não tem leitura das áreas restritas por perfil de UM usuário
   * (só a listagem devolve o campo) e criar essa leitura sai do escopo desta
   * tarefa; fail-closed é o lado seguro.
   */
  private async assertNoSelfScopeChange(
    user: User,
    input: UpdateUserInput
  ): Promise<void> {
    if (
      input.servesClients !== user.props.servesClients ||
      input.schedulingAreaIds.length > 0
    ) {
      throw new SelfEditError()
    }
    const scope = await this.users.findProfessionalScope(user.props.id)
    if (
      !sameIds(scope.areaIds, input.areaIds) ||
      !sameIds(scope.serviceIds, input.serviceIds)
    ) {
      throw new SelfEditError()
    }
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

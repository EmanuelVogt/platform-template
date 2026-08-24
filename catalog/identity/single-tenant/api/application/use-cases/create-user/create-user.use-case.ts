import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { User } from "../../../domain/entities/user.entity"
import { VerificationToken } from "../../../domain/entities/verification-token.entity"
import { EmailAlreadyInUseError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  PROFESSIONAL_SCOPE,
  type ProfessionalScope,
} from "../../../domain/ports/professional-scope.port"
import {
  TOKEN_GENERATOR,
  type TokenGenerator,
} from "../../../domain/ports/token-generator"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "../../../domain/ports/verification-token.repository"
import { IDENTITY_CONFIG, type IdentityConfig } from "../../../identity.config"
import { resolveUserAccess } from "../../access-policy"
import { authEventOf } from "../../auth-event.factory"
import { IDENTITY_ACCESS } from "../../identity-context"

import type { CreateUserInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class CreateUserUseCase implements UseCaseContract<
  CreateUserInput,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(PROFESSIONAL_SCOPE) private readonly scope: ProfessionalScope
  ) {}

  @Transactional()
  @Traced({ name: "identity.createUser" })
  async execute(input: CreateUserInput): Promise<void> {
    const store = this.ctx.get()
    const actorId = this.ctx.getActor()?.id ?? null
    const actorAccess = this.ctx.getExtension(IDENTITY_ACCESS)
    if (actorAccess === undefined) {
      // Fail-closed: a rota exige admin.users.create, então o AuthMiddleware
      // sempre publicou o access; ausente aqui é erro de configuração, não caso de uso.
      throw new ForbiddenError()
    }
    const access = await resolveUserAccess(input, this.scope, {
      actor: actorAccess,
      current: [],
    })

    const email = input.email.trim().toLowerCase()
    const now = this.clock.now()

    const existing = await this.users.findByEmail(email)
    if (existing) {
      // 409 único: dizer que o endereço pertence a um usuário na lixeira conta
      // ao chamador algo que ele não pode ver de outro jeito.
      throw new EmailAlreadyInUseError()
    }

    const user = User.create({
      name: input.name.trim(),
      email,
      accessProfile: input.accessProfile,
      servesClients: input.servesClients,
      createdByUserId: actorId,
    })
    await this.users.insert(user)
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

    const { raw, hash } = this.tokens.generate()
    const expiresAt = new Date(
      now.getTime() + this.config.ACCESS_LINK_TOKEN_TTL_SECONDS * 1000
    )
    await this.verificationTokens.create(
      VerificationToken.create({
        userId: user.props.id,
        tokenHash: hash,
        type: "access_link",
        expiresAt,
      })
    )

    const link = `${this.config.WEB_ORIGIN}/configurar-senha?token=${raw}`
    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: user.props.id,
        type: "access_link_sent",
        locale: store.locale,
        data: {
          email,
          name: user.props.name,
          link,
          tokenExpiresAt: expiresAt.toISOString(),
        },
      })
    )
    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: user.props.id,
        actorUserId: actorId,
        eventType: "access_link_sent",
      })
    )
  }
}

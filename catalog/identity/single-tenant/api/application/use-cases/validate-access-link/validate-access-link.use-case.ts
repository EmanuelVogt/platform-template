import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { InvalidAccessLinkError } from "../../../domain/errors"
import { TOKEN_GENERATOR, type TokenGenerator } from "../../../domain/ports/token-generator"
import { USER_REPOSITORY, type UserRepository } from "../../../domain/ports/user.repository"
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "../../../domain/ports/verification-token.repository"

import type { AccessLinkInfo, ValidateAccessLinkInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ValidateAccessLinkQuery
  implements UseCaseContract<ValidateAccessLinkInput, AccessLinkInfo>
{
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.validateAccessLink" })
  async execute(input: ValidateAccessLinkInput): Promise<AccessLinkInfo> {
    const now = this.clock.now()
    const active = await this.verificationTokens.findActiveByHash(
      this.tokens.hashOf(input.token),
      "access_link",
      now,
    )
    if (!active) {
      throw new InvalidAccessLinkError()
    }
    const user = await this.users.findById(active.userId)
    if (user?.props.status !== "pending") {
      throw new InvalidAccessLinkError()
    }
    return { name: user.props.name, email: user.props.email, avatarAttachmentId: user.props.avatarAttachmentId }
  }
}

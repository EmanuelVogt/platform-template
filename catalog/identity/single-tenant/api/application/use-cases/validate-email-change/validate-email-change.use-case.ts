import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { InvalidEmailChangeTokenError } from "../../../domain/errors"
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

import type {
  ValidateEmailChangeInput,
  ValidateEmailChangeOutput,
} from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/** Pré-valida o token de troca (sem consumir) e devolve o novo e-mail para a UI. */
@UseCase()
export class ValidateEmailChangeQuery implements UseCaseContract<
  ValidateEmailChangeInput,
  ValidateEmailChangeOutput
> {
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.validateEmailChange" })
  async execute(
    input: ValidateEmailChangeInput
  ): Promise<ValidateEmailChangeOutput> {
    const now = this.clock.now()
    const active = await this.verificationTokens.findActiveByHash(
      this.tokens.hashOf(input.token),
      "email_change",
      now
    )
    if (!active) {
      throw new InvalidEmailChangeTokenError()
    }
    const user = await this.users.findById(active.userId)
    const pendingEmail = user?.props.pendingEmail
    if (!pendingEmail) {
      throw new InvalidEmailChangeTokenError()
    }
    return { newEmail: pendingEmail }
  }
}

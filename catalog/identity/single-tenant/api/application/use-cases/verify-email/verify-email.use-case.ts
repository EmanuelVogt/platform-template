import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { InvalidResetTokenError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
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
import { authEventOf } from "../../auth-event.factory"

import type { VerifyEmailInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class VerifyEmailUseCase
  implements UseCaseContract<VerifyEmailInput, void>
{
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
  ) {}

  @Transactional()
  @Traced({ name: "identity.verifyEmail" })
  async execute(input: VerifyEmailInput): Promise<void> {
    const now = this.clock.now()
    const store = this.ctx.get()

    const tokenHash = this.tokens.hashOf(input.token)
    const consumed = await this.verificationTokens.consumeByHash(
      tokenHash,
      "email_verify",
      now,
    )
    if (!consumed) {
      throw new InvalidResetTokenError()
    }

    const user = await this.users.findById(consumed.userId)
    if (!user) {
      throw new InvalidResetTokenError()
    }

    await this.users.update(user.verifyEmail())

    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: consumed.userId,
        eventType: "email_verified",
      }),
    )
  }
}

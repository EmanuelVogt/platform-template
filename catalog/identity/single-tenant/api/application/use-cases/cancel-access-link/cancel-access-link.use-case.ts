import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { InvalidAccessLinkError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  TOKEN_GENERATOR,
  type TokenGenerator,
} from "../../../domain/ports/token-generator"
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "../../../domain/ports/verification-token.repository"
import { authEventOf } from "../../auth-event.factory"

import type { CancelAccessLinkInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class CancelAccessLinkUseCase implements UseCaseContract<
  CancelAccessLinkInput,
  void
> {
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext
  ) {}

  // Recusar o convite: consome o token (link morre). User segue pending —
  // recuperação só via admin (resend-access-link).
  @Transactional()
  @Traced({ name: "identity.cancelAccessLink" })
  async execute(input: CancelAccessLinkInput): Promise<void> {
    const now = this.clock.now()
    const store = this.ctx.get()
    const consumed = await this.verificationTokens.consumeByHash(
      this.tokens.hashOf(input.token),
      "access_link",
      now
    )
    if (!consumed) {
      throw new InvalidAccessLinkError()
    }
    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: consumed.userId,
        eventType: "access_link_cancelled",
      })
    )
  }
}

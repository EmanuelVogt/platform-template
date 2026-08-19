import { Inject, Optional } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { InvalidAccessLinkError } from "../../../domain/errors"
import {
  PROFILE_IMAGE_STORE,
  type ProfileImageStore,
  requireProfileImageStore,
} from "../../../domain/ports/profile-image-store"
import { TOKEN_GENERATOR, type TokenGenerator } from "../../../domain/ports/token-generator"
import { USER_REPOSITORY, type UserRepository } from "../../../domain/ports/user.repository"
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "../../../domain/ports/verification-token.repository"

import type { UploadAccessLinkAvatarInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class UploadAccessLinkAvatarUseCase
  implements UseCaseContract<UploadAccessLinkAvatarInput, { attachmentId: string }>
{
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional()
    @Inject(PROFILE_IMAGE_STORE)
    private readonly profileImages: ProfileImageStore | null = null,
  ) {}

  // Upload pré-auth token-scoped: resolve o user pending dono do token (SEM
  // consumir) e sobe o avatar com ownerUserId = esse user. NÃO muta o user.
  // Magic-bytes/tamanho/allowlist são revalidados no provider da porta.
  @Traced({ name: "identity.uploadAccessLinkAvatar" })
  async execute(
    input: UploadAccessLinkAvatarInput,
  ): Promise<{ attachmentId: string }> {
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
    const { id } = await requireProfileImageStore(this.profileImages).upload({
      bytes: input.bytes,
      declaredContentType: input.declaredContentType,
      originalFilename: input.originalFilename,
      profile: "access-link-avatar",
      ownerUserId: active.userId,
    })
    return { attachmentId: id }
  }
}

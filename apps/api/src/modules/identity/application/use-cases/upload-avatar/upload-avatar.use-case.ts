import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import {
  type AppLogger,
  LoggerFactory,
} from "../../../../../shared/kernel/logging/logger.factory"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { AttachmentFacade } from "../../../../attachment/api/facades/attachment.facade"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { requireAuth } from "../../require-auth"

import type { UploadAvatarInput, UploadAvatarOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/**
 * Upload de avatar do usuário autenticado: sobe o blob (validado/sniffado no
 * AttachmentFacade), associa ao user e remove o avatar anterior. O PUT no R2
 * roda FORA de qualquer tx (IO de rede não segura conexão).
 */
@UseCase()
export class UploadAvatarUseCase
  implements UseCaseContract<UploadAvatarInput, UploadAvatarOutput>
{
  private readonly log: AppLogger

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    private readonly attachments: AttachmentFacade,
    loggerFactory: LoggerFactory,
  ) {
    this.log = loggerFactory.forModule("UploadAvatar")
  }

  @Traced({ name: "identity.uploadAvatar" })
  async execute(input: UploadAvatarInput): Promise<UploadAvatarOutput> {
    const ctx = requireAuth(this.ctx)
    const user = await this.users.findById(ctx.userId)
    if (!user) {
      throw new ForbiddenError()
    }
    const previousAvatarId = user.props.avatarAttachmentId

    const { id } = await this.attachments.upload({
      bytes: input.bytes,
      declaredContentType: input.declaredContentType,
      originalFilename: input.originalFilename,
      profile: "avatar",
      ownerUserId: ctx.userId,
    })

    await this.persistAvatar(ctx.userId, id)

    // Limpeza do avatar antigo é melhor-esforço: órfão tolerável, não falha a request.
    if (previousAvatarId && previousAvatarId !== id) {
      try {
        await this.attachments.delete(previousAvatarId)
      } catch (error) {
        this.log.warn("avatar.cleanup_failed", {
          previousAvatarId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { avatarAttachmentId: id }
  }

  @Transactional()
  private async persistAvatar(userId: string, attachmentId: string): Promise<void> {
    const now = this.clock.now()
    const user = await this.users.findById(userId)
    if (!user) {
      throw new ForbiddenError()
    }
    await this.users.update(user.setAvatar(attachmentId, now))
  }
}

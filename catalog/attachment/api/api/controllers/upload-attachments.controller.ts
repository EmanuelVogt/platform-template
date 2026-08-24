import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common"
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"

import { SelfService } from "../../../../shared/kernel/access/decorators"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { RateLimit } from "../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { UploadAttachmentsBatchUseCase } from "../../application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case"
import {
  ATTACHMENT_CONFIG,
  type AttachmentConfig,
} from "../../attachment.config"
import {
  PendingQuotaExceededError,
  UploadsSaturatedError,
} from "../../domain/errors"
import { formatMegabytes } from "../../domain/format-megabytes"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../domain/ports/attachment.repository"
import {
  UPLOAD_PROFILES,
  type UploadProfileCatalog,
} from "../../domain/upload-profiles"
import {
  UploadAttachmentsQueryDto,
  UploadAttachmentsResponseDto,
} from "../contracts/attachment.contract"

import { readMultipartFiles, UploadGate } from "./multipart-files"

import type { Request, Response } from "express"

@ApiTags("Attachment")
@Controller("attachments/uploads")
export class UploadAttachmentsController {
  constructor(
    private readonly upload: UploadAttachmentsBatchUseCase,
    private readonly ctx: RequestContext,
    @Inject(UPLOAD_PROFILES) private readonly profiles: UploadProfileCatalog,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    @Inject(ATTACHMENT_CONFIG) private readonly config: AttachmentConfig,
    private readonly uploadGate: UploadGate
  ) {}

  @ApiOperation({
    operationId: "uploadAttachments",
    description:
      "Recebe os anexos e repassa ao storage enquanto o corpo chega. O lote é tudo ou nada: se um arquivo estoura a cota, nenhum anexo é registrado. Os ids voltam na ordem dos arquivos enviados.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "array",
          items: { type: "string", format: "binary" },
        },
      },
      required: ["file"],
    },
  })
  @ApiCreatedResponse({ type: UploadAttachmentsResponseDto })
  @SelfService()
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async handle(
    @Query() query: UploadAttachmentsQueryDto,
    @Req() req: Request,
    // passthrough: o Nest continua serializando o retorno; a resposta só é
    // necessária para encerrar a conexão quando o corpo é cortado no meio.
    @Res({ passthrough: true }) res: Response
  ): Promise<UploadAttachmentsResponseDto> {
    // Vaga ocupada até o fim do envio (sucesso ou falha) — é o tempo de vida
    // real da conexão de upload, não só o handshake inicial.
    const release = this.uploadGate.tryAcquire()
    if (release === null) {
      throw new UploadsSaturatedError()
    }
    try {
      const ownerUserId = this.ctx.getActor()?.id ?? null
      if (ownerUserId !== null) {
        const pending = await this.repo.sumPendingBytesByOwner(ownerUserId)
        const contentLength = Number(req.headers["content-length"] ?? 0)
        if (
          pending + contentLength >
          this.config.ATTACHMENT_PENDING_QUOTA_BYTES
        ) {
          throw new PendingQuotaExceededError(
            `O total de envios pendentes não pode passar de ${formatMegabytes(this.config.ATTACHMENT_PENDING_QUOTA_BYTES)}.`
          )
        }
      }

      const profile = this.profiles[query.profile]
      return await this.upload.execute({
        profile: query.profile,
        ownerUserId,
        files: readMultipartFiles(req, res, "file", {
          maxBytes: profile.maxBytes,
          maxFiles: profile.maxFiles,
        }),
      })
    } finally {
      release()
    }
  }
}

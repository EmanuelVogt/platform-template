import { Controller, Get, Param, Req, Res } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { pipeline } from "node:stream/promises"

import { OptionalAuth } from "../../../../shared/kernel/access/decorators"
import { buildContentDisposition } from "../../../../shared/kernel/http/content-disposition"
import { type AppLogger, LoggerFactory } from "../../../../shared/kernel/logging/logger.factory"
import { RateLimit } from "../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { GetAttachmentForDownloadUseCase } from "../../application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case"
import { AttachmentIdParamDto } from "../contracts/attachment.contract"

import type { Request, Response } from "express"

const IMAGE_MAX_AGE_SECONDS = 24 * 60 * 60
const DOCUMENT_MAX_AGE_SECONDS = 5 * 60

// Allowlist fechada por bytes: o `content_type` gravado é o que decide, nunca
// o perfil de upload (um perfil removido/renomeado não pode reabrir a decisão).
const INLINE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

/**
 * Imagem exibida inline é endereçada por id imutável — trocar o avatar cria um
 * anexo novo, então o mesmo id nunca devolve bytes diferentes e `immutable`
 * poupa até o revalidate. O contrapeso é a trilha de acesso: enquanto o cache do
 * navegador vale, a visualização não chega ao servidor e não é registrada. Por
 * isso arquivo baixado (comprovante, relatório, anexo de relato) fica no prazo
 * curto: nesses, a auditoria por download é o próprio requisito.
 */
function cacheControlFor(inline: boolean): string {
  return inline
    ? `private, max-age=${String(IMAGE_MAX_AGE_SECONDS)}, immutable`
    : `private, max-age=${String(DOCUMENT_MAX_AGE_SECONDS)}`
}

@ApiTags("Attachment")
@Controller("attachments")
export class DownloadAttachmentController {
  private readonly log: AppLogger

  constructor(
    private readonly download: GetAttachmentForDownloadUseCase,
    loggerFactory: LoggerFactory,
  ) {
    this.log = loggerFactory.forModule("DownloadAttachment")
  }

  @ApiOperation({ operationId: "downloadAttachment" })
  @OptionalAuth()
  @RateLimit({ limit: 300, windowSeconds: 60 })
  @Get(":id")
  async handle(
    @Param() params: AttachmentIdParamDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.download.execute({ id: params.id })

    const etag = `"${result.checksum}"`
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end()
      return
    }

    const inline = INLINE_CONTENT_TYPES.has(result.contentType)

    if (inline) {
      res.setHeader("Content-Type", result.contentType)
    } else {
      res.setHeader("Content-Type", "application/octet-stream")
      res.setHeader("Content-Disposition", buildContentDisposition(result.originalFilename))
    }
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Length", String(result.sizeBytes))
    res.setHeader("Cache-Control", cacheControlFor(inline))
    res.setHeader("ETag", etag)

    try {
      await pipeline(await result.openStream(), res)
    } catch (error) {
      // Depois de headers/bytes já enviados não dá pra trocar por uma resposta
      // de erro formatada: só resta destruir a conexão e deixar o processo em pé.
      // Antes disso (openStream ainda não abriu nada), propaga pro filtro global.
      if (res.headersSent) {
        this.log.error("attachment.download_stream_failed", {
          attachmentId: params.id,
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }
      throw error
    }
  }
}

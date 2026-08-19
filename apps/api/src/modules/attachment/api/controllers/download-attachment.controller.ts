import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { OptionalAuth } from "../../../../shared/kernel/access/decorators"
import { buildContentDisposition } from "../../../../shared/kernel/http/content-disposition"
import { GetAttachmentForDownloadUseCase } from "../../application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case"
import { AttachmentNotFoundError } from "../../domain/errors"
import { UPLOAD_PROFILES, type UploadProfileCatalog } from "../../domain/upload-profiles"
import { AttachmentIdParamDto } from "../contracts/attachment.contract"

import type { Request, Response } from "express"

const IMAGE_MAX_AGE_SECONDS = 24 * 60 * 60
const DOCUMENT_MAX_AGE_SECONDS = 5 * 60

/**
 * Imagem exibida inline é endereçada por id imutável — trocar o avatar cria um
 * anexo novo, então o mesmo id nunca devolve bytes diferentes e `immutable`
 * poupa até o revalidate. O contrapeso é a trilha de acesso: enquanto o cache do
 * navegador vale, a visualização não chega ao servidor e não é registrada. Por
 * isso arquivo baixado (comprovante, relatório, anexo de relato) fica no prazo
 * curto: nesses, a auditoria por download é o próprio requisito.
 */
function cacheControlFor(forceDownload: boolean): string {
  return forceDownload
    ? `private, max-age=${String(DOCUMENT_MAX_AGE_SECONDS)}`
    : `private, max-age=${String(IMAGE_MAX_AGE_SECONDS)}, immutable`
}

@ApiTags("Attachment")
@Controller("attachments")
export class DownloadAttachmentController {
  constructor(
    private readonly download: GetAttachmentForDownloadUseCase,
    @Inject(UPLOAD_PROFILES) private readonly profiles: UploadProfileCatalog,
  ) {}

  @ApiOperation({ operationId: "downloadAttachment" })
  @OptionalAuth()
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

    // Nome de perfil removido/renomeado (ex.: migração 0005) pode sobreviver em
    // anexo antigo que a migração não alcançou. Servir como octet-stream seria
    // supor "tipo livre" sem base; reaproveita o mesmo 404 anti-enumeração do
    // caso "não encontrado" em vez de vazar o estado interno inconsistente.
    if (result.profile !== "legacy" && !(result.profile in this.profiles)) {
      throw new AttachmentNotFoundError()
    }

    const forceDownload =
      result.profile !== "legacy" && this.profiles[result.profile].accept === "any"

    if (forceDownload) {
      res.setHeader("Content-Type", "application/octet-stream")
      res.setHeader("Content-Disposition", buildContentDisposition(result.originalFilename))
      res.setHeader("X-Content-Type-Options", "nosniff")
    } else {
      res.setHeader("Content-Type", result.contentType)
    }

    res.setHeader("Content-Length", String(result.sizeBytes))
    res.setHeader("Cache-Control", cacheControlFor(forceDownload))
    res.setHeader("ETag", etag)
    result.stream.pipe(res)
  }
}

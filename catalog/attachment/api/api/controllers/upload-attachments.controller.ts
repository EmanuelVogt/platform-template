import {
  Controller,
  HttpCode,
  HttpStatus,
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
import { UploadAttachmentsBatchUseCase } from "../../application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case"
import { readMultipartFiles } from "./multipart-files"
import {
  UploadAttachmentsQueryDto,
  UploadAttachmentsResponseDto,
} from "../contracts/attachment.contract"

import type { Request, Response } from "express"

@ApiTags("Attachment")
@Controller("attachments/uploads")
export class UploadAttachmentsController {
  constructor(
    private readonly upload: UploadAttachmentsBatchUseCase,
    private readonly ctx: RequestContext,
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
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async handle(
    @Query() query: UploadAttachmentsQueryDto,
    @Req() req: Request,
    // passthrough: o Nest continua serializando o retorno; a resposta só é
    // necessária para encerrar a conexão quando o corpo é cortado no meio.
    @Res({ passthrough: true }) res: Response,
  ): Promise<UploadAttachmentsResponseDto> {
    return this.upload.execute({
      profile: query.profile,
      ownerUserId: this.ctx.getActor()?.id ?? null,
      files: readMultipartFiles(req, res, "file"),
    })
  }
}

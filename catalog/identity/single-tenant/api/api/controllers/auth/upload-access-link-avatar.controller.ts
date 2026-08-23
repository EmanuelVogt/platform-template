import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { UploadAccessLinkAvatarUseCase } from "../../../application/use-cases/upload-access-link-avatar/upload-access-link-avatar.use-case"
import { AvatarFileRequiredError, InvalidAccessLinkError } from "../../../domain/errors"
import { AccessLinkAvatarUploadResponseDto } from "../../contracts/identity.contract"

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

@ApiTags("Auth")
@Controller("auth")
export class UploadAccessLinkAvatarController {
  constructor(private readonly upload: UploadAccessLinkAvatarUseCase) {}

  // token no body/form-field (não query — evita vazamento por log/referrer).
  @ApiOperation({ operationId: "uploadAccessLinkAvatar" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        token: { type: "string" },
      },
      required: ["file", "token"],
    },
  })
  @ApiCreatedResponse({ type: AccessLinkAvatarUploadResponseDto })
  @Public()
  @Post("access-link/avatar")
  @RateLimit({ limit: 5, windowSeconds: 60 })
  @HttpCode(HttpStatus.CREATED)
  // Teto no multer: rota pré-auth não pode bufferizar body sem limite (DoS de
  // memória). Espelha o default de ATTACHMENT_MAX_UPLOAD_BYTES; o use case
  // revalida contra o config e segue como gate autoritativo.
  // SPEC_DEVIATION: REM-39 previa `fields: 0` nos dois controllers de avatar;
  // esta rota consome o campo multipart "token" (ver @Body("token") abaixo),
  // então o teto precisa ser 1 — 0 rejeitaria toda chamada legítima com 400.
  // Reason: GHSA-72gw-mp4g-v24j pede limitar os campos extras ao mínimo que a
  // rota realmente aceita, não zerá-los onde ela já declara um campo obrigatório.
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_BYTES, fields: 1 },
    }),
  )
  async handle(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("token") token: string | undefined,
  ): Promise<{ attachmentId: string }> {
    if (file === undefined) {
      throw new AvatarFileRequiredError()
    }
    if (token === undefined || token.length === 0) {
      throw new InvalidAccessLinkError()
    }
    return this.upload.execute({
      token,
      bytes: file.buffer,
      declaredContentType: file.mimetype,
      originalFilename: file.originalname,
    })
  }
}

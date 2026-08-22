import {
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { UploadAvatarUseCase } from "../../../application/use-cases/upload-avatar/upload-avatar.use-case"
import { AvatarFileRequiredError } from "../../../domain/errors"
import { AvatarUploadResponseDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

@ApiTags("Session")
@Controller("auth")
export class UploadAvatarController {
  constructor(private readonly upload: UploadAvatarUseCase) {}

  @ApiOperation({ operationId: "uploadAvatar" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiOkResponse({ type: AvatarUploadResponseDto })
  @SelfService()
  @Post("avatar")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async handle(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ avatarAttachmentId: string }> {
    if (file === undefined) {
      throw new AvatarFileRequiredError()
    }
    return this.upload.execute({
      bytes: file.buffer,
      declaredContentType: file.mimetype,
      originalFilename: file.originalname,
    })
  }
}

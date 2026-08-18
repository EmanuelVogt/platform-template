import { createZodDto } from "nestjs-zod"
import { z } from "zod"

/** Param da rota global de download. */
export const attachmentIdParamSchema = z.object({ id: z.string().min(1) })
export class AttachmentIdParamDto extends createZodDto(attachmentIdParamSchema) {}

export const uploadAttachmentsQuerySchema = z.object({
  profile: z.enum(["feedback-attachment"]),
})
export class UploadAttachmentsQueryDto extends createZodDto(
  uploadAttachmentsQuerySchema,
) {}

export const uploadAttachmentsResponseSchema = z.object({
  uploads: z.array(z.object({ attachmentId: z.string() })),
})
export class UploadAttachmentsResponseDto extends createZodDto(
  uploadAttachmentsResponseSchema,
) {}

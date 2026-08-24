import { createZodDto } from "nestjs-zod"
import { z } from "zod"

export const attachmentAccessActionSchema = z.enum([
  "download",
  "upload",
  "delete",
])

export const attachmentAccessEntrySchema = z.object({
  id: z.string(),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: attachmentAccessActionSchema,
  occurredAt: z.string(),
})
export class AttachmentAccessEntryDto extends createZodDto(
  attachmentAccessEntrySchema
) {}

export const attachmentAccessLogResponseSchema = z.object({
  data: z.array(attachmentAccessEntrySchema),
})
export class AttachmentAccessLogResponseDto extends createZodDto(
  attachmentAccessLogResponseSchema
) {}

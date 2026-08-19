import { DownloadAttachmentController } from "./download-attachment.controller"
import { UploadAttachmentsController } from "./upload-attachments.controller"

export const CONTROLLERS = [
  UploadAttachmentsController,
  DownloadAttachmentController,
] as const

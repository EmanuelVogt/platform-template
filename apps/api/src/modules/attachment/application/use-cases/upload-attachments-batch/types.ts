import type { IncomingFile } from "../../../domain/incoming-file"
import type { UploadProfileName } from "../../../domain/upload-profiles"

export interface UploadAttachmentsBatchInput {
  profile: UploadProfileName
  ownerUserId: string | null
  files: AsyncIterable<IncomingFile>
}

export interface UploadAttachmentsBatchOutput {
  uploads: { attachmentId: string }[]
}

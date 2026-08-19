import type { UploadProfileName } from "../../../domain/upload-profiles"

export interface UploadAttachmentInput {
  bytes: Buffer
  declaredContentType: string
  originalFilename: string | null
  profile: UploadProfileName
  ownerUserId: string | null
}

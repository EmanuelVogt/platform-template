import type { UploadProfileName } from "../../../domain/upload-profiles"

export interface ConfirmUploadsInput {
  ids: string[]
  profile: UploadProfileName
  ownerUserId: string
}

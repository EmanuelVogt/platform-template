export type UploadAvatarInput = {
  bytes: Buffer
  declaredContentType: string
  originalFilename: string | null
}

export type UploadAvatarOutput = {
  avatarAttachmentId: string
}

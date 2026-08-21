export type UploadAccessLinkAvatarInput = {
  token: string
  bytes: Buffer
  declaredContentType: string
  originalFilename: string | null
}

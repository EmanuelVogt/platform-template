import { Attachment } from "../domain/attachment.entity"

import type { AttachmentProps } from "../domain/attachment.entity"

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z")

/** Attachment pronto pra spec: só o que o teste muda entra em `over`. */
export function makeAttachment(
  over: Partial<AttachmentProps> = {}
): Attachment {
  return Attachment.fromProps({
    id: "att-1",
    storageKey: "attachments/att-1",
    contentType: "image/png",
    sizeBytes: 68,
    checksum: null,
    originalFilename: null,
    profile: "avatar",
    visibility: "restricted",
    ownerUserId: "u-1",
    status: "ready",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...over,
  })
}

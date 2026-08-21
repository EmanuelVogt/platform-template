import type { AccessAction } from "../../../domain/ports/attachment-access-log.repository"

export type ListAttachmentAccessLogInput = {
  attachmentId: string
}

export type AttachmentAccessLogEntryView = {
  id: string
  actorUserId: string | null
  actorName: string | null
  action: AccessAction
  occurredAt: Date
}

export type ListAttachmentAccessLogResult = {
  data: AttachmentAccessLogEntryView[]
}

export const ATTACHMENT_ACCESS_LOG_LIMIT = 50

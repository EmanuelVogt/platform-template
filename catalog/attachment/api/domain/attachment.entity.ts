import { ulid } from "ulid"

import type { Visibility } from "./access-policy"
import type { UploadProfileName } from "./upload-profiles"

export type AttachmentStatus = "pending" | "ready" | "deleted"

export interface AttachmentProps {
  readonly id: string
  readonly storageKey: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly checksum: string | null
  readonly originalFilename: string | null
  readonly profile: UploadProfileName | "legacy"
  readonly visibility: Visibility
  readonly ownerUserId: string | null
  readonly status: AttachmentStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateAttachmentInput {
  storageKey: string
  contentType: string
  sizeBytes: number
  checksum: string
  originalFilename: string | null
  profile: UploadProfileName
  visibility: Visibility
  ownerUserId: string | null
}

export interface CreatePendingAttachmentInput {
  contentType: string
  sizeBytes: number
  originalFilename: string | null
  profile: UploadProfileName
  visibility: Visibility
  ownerUserId: string | null
}

export class Attachment {
  readonly props: AttachmentProps

  private constructor(props: AttachmentProps) {
    this.props = Object.freeze(props)
  }

  static fromProps(props: AttachmentProps): Attachment {
    return new Attachment(props)
  }

  static create(input: CreateAttachmentInput): Attachment {
    const now = new Date()
    return new Attachment({
      id: ulid(),
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      originalFilename: input.originalFilename,
      profile: input.profile,
      visibility: input.visibility,
      ownerUserId: input.ownerUserId,
      status: "ready",
      createdAt: now,
      updatedAt: now,
    })
  }

  static createPending(input: CreatePendingAttachmentInput): Attachment {
    const now = new Date()
    const id = ulid()
    return new Attachment({
      id,
      storageKey: `attachments/${id}`,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksum: null,
      originalFilename: input.originalFilename,
      profile: input.profile,
      visibility: input.visibility,
      ownerUserId: input.ownerUserId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
  }

  /** Tamanho real medido durante o upload em fluxo; segue pendente. */
  withUploadedSize(sizeBytes: number): Attachment {
    return new Attachment({ ...this.props, sizeBytes, updatedAt: new Date() })
  }

  markReady(sizeBytes: number, checksum: string): Attachment {
    return new Attachment({
      ...this.props,
      sizeBytes,
      checksum,
      status: "ready",
      updatedAt: new Date(),
    })
  }

  markDeleted(): Attachment {
    return new Attachment({
      ...this.props,
      status: "deleted",
      updatedAt: new Date(),
    })
  }
}

import { Injectable } from "@nestjs/common"

import { AttachmentFacade } from "../facades/attachment.facade"

import type {
  ProfileImageStore,
  ProfileImageUpload,
} from "../../../identity/domain/ports/profile-image-store"

@Injectable()
export class AttachmentProfileImageStore implements ProfileImageStore {
  constructor(private readonly attachments: AttachmentFacade) {}

  upload(image: ProfileImageUpload): Promise<{ id: string }> {
    return this.attachments.upload(image)
  }

  delete(id: string): Promise<void> {
    return this.attachments.delete(id)
  }

  exists(id: string, ownerUserId: string): Promise<boolean> {
    return this.attachments.exists(id, ownerUserId)
  }
}

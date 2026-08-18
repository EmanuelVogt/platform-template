import { DomainEvent } from "../../../../shared/kernel/events/domain-event.base"

export interface TagPurgedPayload {
  tagIds: string[]
}

/** Fato: tags removidas em definitivo; consumidores limpam os próprios vínculos. */
export class TagPurged extends DomainEvent<TagPurgedPayload> {
  static readonly EVENT_NAME = "tag.purged"
  static readonly EVENT_VERSION = 1

  readonly eventName = TagPurged.EVENT_NAME
  readonly eventVersion = TagPurged.EVENT_VERSION

  static from(payload: TagPurgedPayload): TagPurged {
    return new TagPurged({
      aggregateId: payload.tagIds[0] ?? "batch",
      aggregateType: "Tag",
      payload,
    })
  }
}

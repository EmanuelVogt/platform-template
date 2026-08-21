import { ulid } from "ulid"

export type NotificationAction = {
  readonly label: string
  readonly deepLink: string
}

export type NotificationProps = {
  readonly id: string
  readonly recipientId: string
  readonly type: string
  readonly title: string
  readonly body: string
  readonly actions: readonly NotificationAction[]
  readonly metadata: Readonly<Record<string, unknown>>
  readonly locale: string
  readonly seenAt: Date | null
  readonly readAt: Date | null
  readonly archivedAt: Date | null
  readonly createdAt: Date
}

/** Item do feed in-app. Render-at-write: title/body/actions já congelados. */
export class Notification {
  constructor(readonly props: NotificationProps) {
    Object.freeze(props)
  }

  static create(input: {
    recipientId: string
    type: string
    title: string
    body: string
    actions: readonly NotificationAction[]
    metadata: Record<string, unknown>
    locale: string
  }): Notification {
    return new Notification({
      id: ulid(),
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      actions: input.actions,
      metadata: input.metadata,
      locale: input.locale,
      seenAt: null,
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    })
  }

  /** Vista no sino. No-op se já vista (timestamp original é a verdade). */
  markSeen(at: Date): Notification {
    if (this.props.seenAt) {
      return this
    }
    return new Notification({ ...this.props, seenAt: at })
  }

  /** Lida explicitamente. Lida implica vista — item lido não conta no badge. */
  markRead(at: Date): Notification {
    if (this.props.readAt) {
      return this
    }
    return new Notification({
      ...this.props,
      readAt: at,
      seenAt: this.props.seenAt ?? at,
    })
  }

  /** Sai do inbox sem deletar. No-op se já arquivada. */
  archive(at: Date): Notification {
    if (this.props.archivedAt) {
      return this
    }
    return new Notification({ ...this.props, archivedAt: at })
  }
}

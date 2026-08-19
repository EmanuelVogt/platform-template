import { Notification } from "../../domain/entities/notification.entity"

import type { NotificationAction } from "../../domain/entities/notification.entity"
import type {
  NotificationInsert,
  NotificationRow,
} from "../tables/notification.table"

export function toNotificationEntity(row: NotificationRow): Notification {
  return new Notification({
    id: row.id,
    recipientId: row.recipientId,
    type: row.type,
    title: row.title,
    body: row.body,
    actions: row.actions as NotificationAction[],
    metadata: row.metadata as Record<string, unknown>,
    locale: row.locale,
    seenAt: row.seenAt,
    readAt: row.readAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  })
}

export function toNotificationRow(entity: Notification): NotificationInsert {
  const p = entity.props
  return {
    id: p.id,
    recipientId: p.recipientId,
    type: p.type,
    title: p.title,
    body: p.body,
    actions: p.actions,
    metadata: p.metadata,
    locale: p.locale,
    seenAt: p.seenAt,
    readAt: p.readAt,
    archivedAt: p.archivedAt,
    createdAt: p.createdAt,
  }
}

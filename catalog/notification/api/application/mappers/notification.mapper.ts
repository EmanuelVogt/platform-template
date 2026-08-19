import { Injectable } from "@nestjs/common"

import type { NotificationItem } from "../../api/contracts/notification.contract"
import type { Notification } from "../../domain/entities/notification.entity"

@Injectable()
export class NotificationMapper {
  toItem(n: Notification): NotificationItem {
    const p = n.props
    return {
      id: p.id,
      type: p.type,
      title: p.title,
      body: p.body,
      actions: [...p.actions],
      metadata: p.metadata,
      locale: p.locale,
      seenAt: p.seenAt?.toISOString() ?? null,
      readAt: p.readAt?.toISOString() ?? null,
      archivedAt: p.archivedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    } as NotificationItem
  }
}

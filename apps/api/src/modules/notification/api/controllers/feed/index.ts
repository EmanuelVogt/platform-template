import { ArchiveNotificationController } from "./archive-notification.controller"
import { ListNotificationsController } from "./list-notifications.controller"
import { MarkAllReadController } from "./mark-all-read.controller"
import { MarkAllSeenController } from "./mark-all-seen.controller"
import { MarkReadController } from "./mark-read.controller"
import { UnseenCountController } from "./unseen-count.controller"

// Rotas estáticas ANTES das paramétricas (:id) — Nest registra na ordem.
export const FEED_CONTROLLERS = [
  ListNotificationsController,
  UnseenCountController,
  MarkAllSeenController,
  MarkAllReadController,
  MarkReadController,
  ArchiveNotificationController,
]

import { Notification } from "../domain/entities/notification.entity"

import type { NotificationProps } from "../domain/entities/notification.entity"

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z")

/** Notification pronta pra spec: só o que o teste muda entra em `over`. */
export function makeNotification(
  over: Partial<NotificationProps> = {}
): Notification {
  return new Notification({
    id: "notif-1",
    recipientId: "u-1",
    type: "password_changed",
    title: "t",
    body: "b",
    actions: [],
    metadata: {},
    locale: "pt-BR",
    seenAt: null,
    readAt: null,
    archivedAt: null,
    createdAt: FIXED_NOW,
    ...over,
  })
}

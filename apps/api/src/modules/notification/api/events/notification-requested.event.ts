import { DomainEvent } from "../../../../shared/kernel/events/domain-event.base"

/**
 * Tipos do catálogo de notificações. Vivem em `api/events/` — superfície
 * pública do módulo notification (KPB-05): origens (identity, scheduling)
 * importam daqui.
 */
export const NOTIFICATION_TYPES = [
  "access_link_sent",
  "email_verification",
  "password_reset_requested",
  "account_lockout",
  "password_changed",
  "device_new_login",
  "device_revoked",
  "password_set",
  "email_change_requested",
  "email_change_notice",
] as const

/**
 * Registry aberto: cada módulo de produto aumenta esta interface com os tipos
 * que ele mesmo emite (`declare module`), como o `PermissionKeyRegistry`.
 */
export interface NotificationTypeRegistry {
  readonly notification: (typeof NOTIFICATION_TYPES)[number]
}

export type NotificationType = NonNullable<
  NotificationTypeRegistry[keyof NotificationTypeRegistry]
>

export interface NotificationRequestedPayload {
  recipientId: string
  type: NotificationType
  locale: string
  /** Conteúdo da intenção, validado pelo catálogo do consumer (dataSchema por type). */
  data: Record<string, unknown>
}

/** Comando: a origem pede uma notificação sem conhecer canal/template/entrega. */
export class NotificationRequested extends DomainEvent<NotificationRequestedPayload> {
  static readonly EVENT_NAME = "notification.requested"
  static readonly EVENT_VERSION = 1

  readonly eventName = NotificationRequested.EVENT_NAME
  readonly eventVersion = NotificationRequested.EVENT_VERSION

  static from(payload: NotificationRequestedPayload): NotificationRequested {
    return new NotificationRequested({
      aggregateId: payload.recipientId,
      aggregateType: "Notification",
      payload,
    })
  }
}

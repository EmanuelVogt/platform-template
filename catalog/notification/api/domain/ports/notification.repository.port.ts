import type { Notification } from "../entities/notification.entity"

export type NotificationLifecycleFilter = "unread" | "read" | "archived" | "all"

export type ListNotificationsParams = {
  page: number
  pageSize: number
  /** undefined = inbox (não-arquivadas, lidas e não-lidas). */
  filter?: NotificationLifecycleFilter
}

export interface NotificationRepositoryPort {
  insert(notification: Notification): Promise<void>
  /** Escopo de dono no WHERE — id alheio retorna null (no-op silencioso, sem oráculo). */
  findByIdForRecipient(id: string, recipientId: string): Promise<Notification | null>
  update(notification: Notification): Promise<void>
  list(
    recipientId: string,
    params: ListNotificationsParams
  ): Promise<{ data: Notification[]; total: number }>
  /** Badge: seen_at IS NULL AND archived_at IS NULL. */
  countUnseen(recipientId: string): Promise<number>
  /** Set-based (não passa pela entidade — precedente registerFailedAttempt). */
  markAllSeen(recipientId: string, at: Date): Promise<number>
  /** Lida implica vista: também preenche seen_at quando null. */
  markAllRead(recipientId: string, at: Date): Promise<number>
}

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY")

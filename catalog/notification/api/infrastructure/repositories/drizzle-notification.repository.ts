import { Injectable } from "@nestjs/common"
import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { notifications } from "../tables/notification.table"

import {
  toNotificationEntity,
  toNotificationRow,
} from "./notification.persistence-mapper"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { Notification } from "../../domain/entities/notification.entity"
import type {
  ListNotificationsParams,
  NotificationRepositoryPort,
} from "../../domain/ports/notification.repository.port"
import type { SQL } from "drizzle-orm"

@Injectable()
export class DrizzleNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async insert(notification: Notification): Promise<void> {
    await this.db.insert(notifications).values(toNotificationRow(notification))
  }

  async findByIdForRecipient(
    id: string,
    recipientId: string
  ): Promise<Notification | null> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientId, recipientId)
        )
      )
      .limit(1)
    return rows[0] ? toNotificationEntity(rows[0]) : null
  }

  async update(notification: Notification): Promise<void> {
    const row = toNotificationRow(notification)
    await this.db
      .update(notifications)
      .set({
        seenAt: row.seenAt,
        readAt: row.readAt,
        archivedAt: row.archivedAt,
      })
      .where(
        and(
          eq(notifications.id, notification.props.id),
          eq(notifications.recipientId, notification.props.recipientId)
        )
      )
  }

  async list(
    recipientId: string,
    params: ListNotificationsParams
  ): Promise<{ data: Notification[]; total: number }> {
    const where = and(
      eq(notifications.recipientId, recipientId),
      ...this.lifecycleConds(params.filter)
    )
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      this.db.select({ value: count() }).from(notifications).where(where),
    ])
    return {
      data: rows.map(toNotificationEntity),
      total: totals[0]?.value ?? 0,
    }
  }

  private lifecycleConds(filter: ListNotificationsParams["filter"]): SQL[] {
    switch (filter) {
      case "unread":
        return [isNull(notifications.readAt), isNull(notifications.archivedAt)]
      case "read":
        return [
          isNotNull(notifications.readAt),
          isNull(notifications.archivedAt),
        ]
      case "archived":
        return [isNotNull(notifications.archivedAt)]
      case "all":
        return []
      default:
        // inbox: não-arquivadas (lidas e não-lidas)
        return [isNull(notifications.archivedAt)]
    }
  }

  async countUnseen(recipientId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.seenAt),
          isNull(notifications.archivedAt)
        )
      )
    return rows[0]?.value ?? 0
  }

  async markAllSeen(recipientId: string, at: Date): Promise<number> {
    const updated = await this.db
      .update(notifications)
      .set({ seenAt: at })
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.seenAt),
          isNull(notifications.archivedAt)
        )
      )
      .returning({ id: notifications.id })
    return updated.length
  }

  async markAllRead(recipientId: string, at: Date): Promise<number> {
    const updated = await this.db
      .update(notifications)
      .set({
        readAt: at,
        seenAt: sql`coalesce(${notifications.seenAt}, ${at})`,
      })
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt)
        )
      )
      .returning({ id: notifications.id })
    return updated.length
  }
}

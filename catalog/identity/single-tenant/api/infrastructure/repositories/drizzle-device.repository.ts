import { Injectable } from "@nestjs/common"
import { and, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Device } from "../../domain/entities/device.entity"
import { devices, type DeviceRow } from "../tables/devices.table"
import { sessions } from "../tables/session.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type {
  DeviceRepository,
  DeviceWithActivity,
} from "../../domain/ports/device.repository"

@Injectable()
export class DrizzleDeviceRepository implements DeviceRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async create(device: Device): Promise<void> {
    const p = device.props
    await this.db.insert(devices).values({
      id: p.id,
      userId: p.userId,
      cookieTokenHash: p.cookieTokenHash,
      label: p.label,
      firstSeenAt: p.firstSeenAt,
      createdAt: p.createdAt,
    })
  }

  async findByUserAndCookieHash(
    userId: string,
    cookieTokenHash: string
  ): Promise<Device | null> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.cookieTokenHash, cookieTokenHash)
        )
      )
      .limit(1)
    const [row] = rows
    return row ? this.toEntity(row) : null
  }

  async listActiveByUser(
    userId: string,
    now: Date,
    idleTtlSeconds: number,
    absoluteTtlSeconds: number
  ): Promise<DeviceWithActivity[]> {
    // Mesma regra de isExpired, em SQL: idle por last_seen_at, absoluto por created_at.
    const idleThreshold = new Date(now.getTime() - idleTtlSeconds * 1000)
    const absoluteThreshold = new Date(
      now.getTime() - absoluteTtlSeconds * 1000
    )
    const activeFilter = and(
      eq(sessions.userId, userId),
      gt(sessions.lastSeenAt, idleThreshold),
      gt(sessions.createdAt, absoluteThreshold)
    )

    // 1. Agregados por device (innerJoin garante device_id não-nulo).
    const agg = await this.db
      .select({
        id: devices.id,
        firstSeenAt: devices.firstSeenAt,
        // max() não herda o decoder da coluna: sem .mapWith volta string, não Date.
        lastSeenAt: sql<Date>`max(${sessions.lastSeenAt})`.mapWith(
          sessions.lastSeenAt
        ),
        activeSessionCount: sql<number>`count(*)::int`,
      })
      .from(devices)
      .innerJoin(sessions, eq(sessions.deviceId, devices.id))
      .where(and(eq(devices.userId, userId), activeFilter))
      .groupBy(devices.id)
    if (agg.length === 0) return []

    // 2. IP/UA da sessão mais recente por device (DISTINCT ON).
    const latest = await this.db
      .selectDistinctOn([sessions.deviceId], {
        deviceId: sessions.deviceId,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(and(isNotNull(sessions.deviceId), activeFilter))
      .orderBy(sessions.deviceId, desc(sessions.lastSeenAt))
    const byDevice = new Map(latest.map((r) => [r.deviceId, r]))

    return agg.map((d) => ({
      id: d.id,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      activeSessionCount: d.activeSessionCount,
      ipAddress: byDevice.get(d.id)?.ipAddress ?? null,
      userAgent: byDevice.get(d.id)?.userAgent ?? null,
    }))
  }

  async deleteById(id: string, userId: string): Promise<number> {
    const result = await this.db
      .delete(devices)
      .where(and(eq(devices.id, id), eq(devices.userId, userId)))
    return result.rowCount ?? 0
  }

  async deleteOthers(
    userId: string,
    currentDeviceId: string | null
  ): Promise<void> {
    if (currentDeviceId === null) {
      // Sessão órfã (D1): sem atual a preservar — revoga todos os devices do user.
      await this.db.delete(devices).where(eq(devices.userId, userId))
      return
    }
    await this.db
      .delete(devices)
      .where(and(eq(devices.userId, userId), ne(devices.id, currentDeviceId)))
  }

  private toEntity(row: DeviceRow): Device {
    return Device.fromProps({
      id: row.id,
      userId: row.userId,
      cookieTokenHash: row.cookieTokenHash,
      label: row.label,
      firstSeenAt: row.firstSeenAt,
      createdAt: row.createdAt,
    })
  }
}

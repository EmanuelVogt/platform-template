import { Injectable } from "@nestjs/common"
import { and, asc, eq, ne, sql } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Session } from "../../domain/entities/session.entity"
import { sessions, type SessionRow } from "../tables/session.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { SessionRepository } from "../../domain/ports/session.repository"

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async create(session: Session): Promise<void> {
    const p = session.props
    await this.db.insert(sessions).values({
      id: p.id,
      userId: p.userId,
      tokenHash: p.tokenHash,
      createdAt: p.createdAt,
      lastSeenAt: p.lastSeenAt,
      expiresAt: p.expiresAt,
      rememberMe: p.rememberMe,
      ipAddress: p.ipAddress,
      userAgent: p.userAgent,
      deviceId: p.deviceId,
    })
  }

  async findByTokenHash(hash: string): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hash))
      .limit(1)
    const [row] = rows
    if (!row) return null
    return this.toEntity(row)
  }

  /** UPDATE condicional throttled: o intervalo é decidido no use-case (Plano 4). */
  async touch(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastSeenAt, expiresAt })
      .where(eq(sessions.id, id))
  }

  async listByUser(userId: string): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(asc(sessions.createdAt))
    return rows.map((r) => this.toEntity(r))
  }

  /** Escopo por dono (anti-IDOR): só apaga se a sessão é do userId. Retorna rowCount. */
  async deleteById(id: string, userId: string): Promise<number> {
    const result = await this.db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    return result.rowCount ?? 0
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId))
  }

  /** ne(id, currentSessionId): NUNCA `<> NULL` (three-valued não excluiria nada). */
  async deleteOthers(userId: string, currentSessionId: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId))
      )
  }

  async deleteByDevice(deviceId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.deviceId, deviceId))
  }

  async countByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(eq(sessions.userId, userId))
    return rows[0]?.n ?? 0
  }

  /** Revoga as mais antigas que excedem o cap (conta comprometida não cria infinitas). */
  async deleteOldestOverCap(userId: string, cap: number): Promise<void> {
    const keep = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(sql`${sessions.createdAt} DESC`)
      .limit(cap)
    await this.db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, userId), sql`${sessions.id} NOT IN (${keep})`)
      )
  }

  private toEntity(row: SessionRow): Session {
    return Session.fromProps({
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      rememberMe: row.rememberMe,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      deviceId: row.deviceId,
    })
  }
}

import { Injectable } from "@nestjs/common"
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { verificationTokens } from "../tables/verification-token.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type {
  TokenType,
  VerificationToken,
} from "../../domain/entities/verification-token.entity"
import type { VerificationTokenRepository } from "../../domain/ports/verification-token.repository"

@Injectable()
export class DrizzleVerificationTokenRepository implements VerificationTokenRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async create(token: VerificationToken): Promise<void> {
    const p = token.props
    await this.db.insert(verificationTokens).values({
      id: p.id,
      userId: p.userId,
      type: p.type,
      tokenHash: p.tokenHash,
      expiresAt: p.expiresAt,
      consumedAt: p.consumedAt,
      createdAt: p.createdAt,
    })
  }

  /**
   * Consumo ATÔMICO single-use (spec §8): o UPDATE só atinge a linha se ainda
   * não-consumida E não-expirada. RETURNING + rowCount garante que sob corrida
   * só UM consumidor recebe o user_id; o outro recebe 0 rows (null).
   */
  async consumeByHash(
    hash: string,
    type: TokenType,
    now: Date
  ): Promise<{ userId: string } | null> {
    const updated = await this.db
      .update(verificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(verificationTokens.tokenHash, hash),
          eq(verificationTokens.type, type),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, now)
        )
      )
      .returning({ userId: verificationTokens.userId })
    const [row] = updated
    if (!row) return null
    return { userId: row.userId }
  }

  async findActiveByHash(
    hash: string,
    type: TokenType,
    now: Date
  ): Promise<{ userId: string; expiresAt: Date } | null> {
    const rows = await this.db
      .select({
        userId: verificationTokens.userId,
        expiresAt: verificationTokens.expiresAt,
      })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.tokenHash, hash),
          eq(verificationTokens.type, type),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, now)
        )
      )
      .limit(1)
    const [row] = rows
    if (!row) return null
    return { userId: row.userId, expiresAt: row.expiresAt }
  }

  async findLatestForUser(
    userId: string,
    type: TokenType
  ): Promise<{ expiresAt: Date; consumedAt: Date | null } | null> {
    const rows = await this.db
      .select({
        expiresAt: verificationTokens.expiresAt,
        consumedAt: verificationTokens.consumedAt,
      })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.type, type)
        )
      )
      .orderBy(desc(verificationTokens.createdAt))
      .limit(1)
    const [row] = rows
    if (!row) return null
    return { expiresAt: row.expiresAt, consumedAt: row.consumedAt }
  }

  /** Invalida todos os tokens pendentes do tipo (reset bem-sucedido, spec §8). */
  async invalidateAllForUser(userId: string, type: TokenType): Promise<void> {
    await this.db
      .update(verificationTokens)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.type, type),
          isNull(verificationTokens.consumedAt)
        )
      )
  }
}

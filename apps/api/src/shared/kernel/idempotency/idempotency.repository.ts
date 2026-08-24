import { Injectable } from "@nestjs/common"
import { and, eq, lt, sql } from "drizzle-orm"

import { TransactionManager } from "../transactional/transaction-manager"

import { idempotencyKeys, type IdempotencyRow } from "./idempotency.table"

import type { DrizzleExecutor } from "../../infra/database/drizzle.provider"

export type IdempotencyStatus = "in_progress" | "completed" | "failed"

export type ReserveInput = {
  scope: string
  key: string
  endpoint: string
  requestHash: string
  expiresAt: Date
}

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  /** Reserva a chave (in_progress). Retorna a row em conflito, ou null se reservou. */
  async tryReserve(input: ReserveInput): Promise<IdempotencyRow | null> {
    const inserted = await this.db
      .insert(idempotencyKeys)
      .values({
        scope: input.scope,
        key: input.key,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        status: "in_progress",
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [idempotencyKeys.scope, idempotencyKeys.key],
        set: {
          status: "in_progress",
          endpoint: input.endpoint,
          requestHash: input.requestHash,
          responseStatus: null,
          responseBody: null,
          createdAt: sql`now()`,
          expiresAt: input.expiresAt,
        },
        // Reclama a chave só se já expirou; senão o UPDATE não casa e a row
        // viva é preservada (TTL deixa de ser decorativo).
        setWhere: sql`${idempotencyKeys.expiresAt} < now()`,
      })
      .returning()
    if (inserted.length > 0) {
      return null
    }
    const existing = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.scope, input.scope),
          eq(idempotencyKeys.key, input.key)
        )
      )
      .limit(1)
    return existing[0] ?? null
  }

  /**
   * Reabre uma key 'failed' para re-execução. Retorna true só para o chamador
   * que venceu a transição failed→in_progress; false se a row já não estava
   * 'failed' (outro request concorrente reabriu). O predicado status='failed'
   * é a barreira de exclusão mútua — sem ele dois retries re-executariam o
   * handler e o efeito externo rodaria 2x.
   */
  async reopen(scope: string, key: string): Promise<boolean> {
    const updated = await this.db
      .update(idempotencyKeys)
      .set({ status: "in_progress", responseStatus: null, responseBody: null })
      .where(
        and(
          eq(idempotencyKeys.scope, scope),
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.status, "failed")
        )
      )
      .returning({ scope: idempotencyKeys.scope })
    return updated.length > 0
  }

  async complete(
    scope: string,
    key: string,
    status: IdempotencyStatus,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void> {
    await this.db
      .update(idempotencyKeys)
      .set({ status, responseStatus, responseBody })
      .where(
        and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key))
      )
  }

  /** Apaga rows expiradas (cleanup nightly). Retorna a contagem removida. */
  async deleteExpired(): Promise<number> {
    const deleted = await this.db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, sql`now()`))
      .returning({ scope: idempotencyKeys.scope })
    return deleted.length
  }
}

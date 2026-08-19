import { Injectable } from "@nestjs/common"
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm"

import { toPaginated } from "../../../../shared/kernel/listing/paginated"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { AuthEvent } from "../../domain/entities/auth-event.entity"
import { authEvents, type AuthEventRow } from "../tables/auth-event.table"

import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { AuthEventType } from "../../domain/entities/auth-event.entity"
import type {
  AuthEventListParams,
  AuthEventRepository,
} from "../../domain/ports/auth-event.repository"

/**
 * Duas gravações deliberadamente distintas: `record` é o evento de FALHA, que
 * nasce nos caminhos sem transação do login e commita na hora; `recordInTx`
 * atrela o evento de SUCESSO à mutação da tx corrente. Cada um lança se estiver
 * no regime do outro.
 */
@Injectable()
export class DrizzleAuthEventRepository implements AuthEventRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db() {
    return this.tx.getExecutor()
  }

  async record(event: AuthEvent): Promise<void> {
    await this.tx.outsideTransaction().insert(authEvents).values(this.toRow(event))
  }

  async recordInTx(event: AuthEvent): Promise<void> {
    // Sem tx ativa, getExecutor() cairia no executor raiz e gravaria com commit
    // imediato — auditoria de sucesso órfã se a operação reverter (§10). Lança
    // em vez de degradar em silêncio.
    if (!this.tx.isInTransaction()) {
      throw new Error(
        "recordInTx exige uma transação aberta; use record() fora de tx"
      )
    }
    await this.tx.getExecutor().insert(authEvents).values(this.toRow(event))
  }

  async listByUser(
    userId: string,
    params: AuthEventListParams,
    allowlist: readonly AuthEventType[]
  ): Promise<PaginatedResult<AuthEvent>> {
    // allowlist vazia: sem evento possível — evita depender do "1=0" implícito do Drizzle.
    if (allowlist.length === 0) {
      return toPaginated([], 0, params.page, params.pageSize)
    }

    const dir = params.order === "asc" ? asc : desc
    const where = and(
      eq(authEvents.userId, userId),
      // workaround: inArray do Drizzle não aceita readonly[]; cast é seguro (não muta a lista)
      inArray(authEvents.eventType, allowlist as AuthEventType[])
    )
    const offset = (params.page - 1) * params.pageSize

    const rows = await this.db
      .select()
      .from(authEvents)
      .where(where)
      // id como tiebreaker estável (ULID monotônico ~ created_at): paginação sem skip/dup
      .orderBy(dir(authEvents.createdAt), dir(authEvents.id))
      .limit(params.pageSize)
      .offset(offset)

    const countRows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(authEvents)
      .where(where)
    const total = countRows[0]?.n ?? 0

    return toPaginated(
      rows.map((r) => this.toEntity(r)),
      total,
      params.page,
      params.pageSize
    )
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    if (!this.tx.isInTransaction()) {
      throw new Error(
        "deleteOlderThan exige uma transação aberta (escape hatch GUC é transaction-scoped)"
      )
    }
    const db = this.tx.getExecutor()
    await db.execute(sql`SELECT set_config('app.auth_events_purge', 'on', true)`)
    const result = await db
      .delete(authEvents)
      .where(lt(authEvents.createdAt, cutoff))
    return result.rowCount ?? 0
  }

  private toEntity(row: AuthEventRow): AuthEvent {
    return AuthEvent.fromProps({
      id: row.id,
      userId: row.userId,
      actorUserId: row.actorUserId,
      eventType: row.eventType,
      emailHash: row.emailHash,
      ip: row.ip,
      userAgent: row.userAgent,
      correlationId: row.correlationId,
      traceId: row.traceId,
      spanId: row.spanId,
      metadata: row.metadata,
      createdAt: row.createdAt,
    })
  }

  private toRow(event: AuthEvent) {
    const e = event.props
    return {
      id: e.id,
      userId: e.userId,
      actorUserId: e.actorUserId,
      eventType: e.eventType,
      emailHash: e.emailHash,
      ip: e.ip,
      userAgent: e.userAgent,
      correlationId: e.correlationId,
      traceId: e.traceId,
      spanId: e.spanId,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }
  }
}

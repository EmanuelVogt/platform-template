import { Injectable } from "@nestjs/common"
import { and, eq } from "drizzle-orm"

import { TransactionManager } from "../transactional/transaction-manager"

import { processedEvents } from "./processed-events.table"

import type { DrizzleExecutor } from "../../infra/database/drizzle.provider"

@Injectable()
export class ProcessedEventsRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  /**
   * Marca evento como processado pelo consumer. Insert idempotente.
   *
   * @param eventId - ULID do evento.
   * @param consumer - Identificador estável (`<module>:<handler-id>`).
   * @returns `true` se foi inserido agora; `false` se já existia.
   */
  async markIfNew(eventId: string, consumer: string): Promise<boolean> {
    const inserted = await this.db
      .insert(processedEvents)
      .values({ eventId, consumer })
      .onConflictDoNothing()
      .returning({ eventId: processedEvents.eventId })
    return inserted.length > 0
  }

  /**
   * Guard de dedupe que NÃO marca: para handler de IO externo (ADR 0022),
   * onde o mark só pode entrar após o efeito ter sucesso, via `markIfNew`.
   */
  async wasProcessed(eventId: string, consumer: string): Promise<boolean> {
    const rows = await this.db
      .select({ eventId: processedEvents.eventId })
      .from(processedEvents)
      .where(
        and(
          eq(processedEvents.eventId, eventId),
          eq(processedEvents.consumer, consumer)
        )
      )
      .limit(1)
    return rows.length > 0
  }
}

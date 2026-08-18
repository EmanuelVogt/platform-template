import { and, eq, gte, isNotNull } from "drizzle-orm"

import { loadDotenvForDev } from "../shared/config/load-dotenv"
import {
  createDrizzle,
  createPool,
} from "../shared/infra/database/drizzle.provider"
import { outbox, outboxDead } from "../shared/kernel/outbox/outbox.table"

import * as schema from "./schema"

import type { DrizzleDb } from "../shared/infra/database/drizzle.provider"

/**
 * Reenfileira um evento por event_id. Se ainda está no outbox (vivo), reseta
 * publishedAt/attempts/nextAttemptAt; se já foi dead-lettered, reinsere do
 * outbox_dead. O reprocessamento passa pelo fluxo normal (dispatch + markIfNew
 * do consumer dedupe). Retorna quantas linhas foram reenfileiradas (0 ou 1).
 */
export async function replayByEventId(
  db: DrizzleDb,
  eventId: string
): Promise<number> {
  const reset = await db
    .update(outbox)
    .set({
      publishedAt: null,
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    })
    .where(eq(outbox.eventId, eventId))
    .returning({ eventId: outbox.eventId })
  if (reset.length > 0) {
    return reset.length
  }

  const dead = await db
    .select()
    .from(outboxDead)
    .where(eq(outboxDead.eventId, eventId))
    .limit(1)
  const [row] = dead
  if (row === undefined) {
    return 0
  }

  await db
    .insert(outbox)
    .values({
      eventId: row.eventId,
      eventName: row.eventName,
      eventVersion: row.eventVersion,
      aggregateId: row.aggregateId,
      aggregateType: row.aggregateType,
      payload: row.payload,
      correlationId: row.correlationId,
      causationId: row.causationId,
      tenantId: row.tenantId,
      traceparent: row.traceparent,
      occurredAt: row.occurredAt,
      attempts: 0,
      nextAttemptAt: new Date(),
    })
    .onConflictDoNothing()
  await db.delete(outboxDead).where(eq(outboxDead.eventId, eventId))
  return 1
}

/** Reenfileira todos os eventos já publicados com occurred_at >= `since`. */
export async function replaySince(db: DrizzleDb, since: Date): Promise<number> {
  const reset = await db
    .update(outbox)
    .set({
      publishedAt: null,
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    })
    .where(and(gte(outbox.occurredAt, since), isNotNull(outbox.publishedAt)))
    .returning({ eventId: outbox.eventId })
  return reset.length
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

async function main(): Promise<void> {
  loadDotenvForDev()
  const pool = createPool()
  try {
    const db = createDrizzle(pool, schema)
    const eventId = parseArg("event-id")
    const since = parseArg("since")

    if (eventId) {
      const n = await replayByEventId(db, eventId)
      console.info(`[outbox:replay] event-id=${eventId}: ${n} reenfileirado(s)`)
    } else if (since) {
      const n = await replaySince(db, new Date(since))
      console.info(`[outbox:replay] since=${since}: ${n} reenfileirado(s)`)
    } else {
      console.error("uso: outbox:replay --event-id=<id> | --since=<ISO>")
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

// Só executa quando rodado direto (ts-node), não quando importado por teste.
if (require.main === module) {
  void main().catch((err: unknown) => {
    console.error(
      `[outbox:replay] falhou: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exitCode = 1
  })
}

import { Injectable } from "@nestjs/common"
import { and, eq, gte, isNull, lt, max, sql } from "drizzle-orm"

import { bucketOf } from "../../../../shared/kernel/clock/bucket-sql"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { authEvents } from "../tables/auth-event.table"
import { sessions } from "../tables/session.table"
import { users } from "../tables/user.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type {
  LoginBucketRow,
  UsageBucketWindow,
  UsageStatsReader,
  UserInactivityRow,
} from "../../domain/ports/usage-stats.reader"

function latest(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b
  if (b === null) return a
  return a > b ? a : b
}

@Injectable()
export class DrizzleUsageStatsReader implements UsageStatsReader {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async countLoginsByBucket(
    window: UsageBucketWindow
  ): Promise<LoginBucketRow[]> {
    const bucket = bucketOf(authEvents.createdAt, window.unit)
    const rows = await this.db
      .select({ bucket, count: sql<number>`count(*)::int` })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.eventType, "login_success"),
          gte(authEvents.createdAt, window.from),
          lt(authEvents.createdAt, window.to)
        )
      )
      .groupBy(bucket)
    return rows.map((row) => ({
      bucket: new Date(row.bucket),
      count: row.count,
    }))
  }

  /**
   * Três leituras agregadas em vez de subquery correlacionada: dentro do
   * subselect o drizzle não qualifica a coluna da tabela externa, e a
   * correlação se perderia em silêncio — todo colaborador apareceria como
   * "nunca acessou".
   */
  async listUserInactivity(): Promise<UserInactivityRow[]> {
    const [people, lastSeen, lastLogin] = await Promise.all([
      this.db
        .select({
          userId: users.id,
          name: users.name,
          accessProfile: users.accessProfile,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(isNull(users.deletedAt)),
      this.db
        .select({ userId: sessions.userId, at: max(sessions.lastSeenAt) })
        .from(sessions)
        .groupBy(sessions.userId),
      this.db
        .select({ userId: authEvents.userId, at: max(authEvents.createdAt) })
        .from(authEvents)
        .where(eq(authEvents.eventType, "login_success"))
        .groupBy(authEvents.userId),
    ])

    const bySession = new Map(lastSeen.map((row) => [row.userId, row.at]))
    const byLogin = new Map(
      lastLogin.flatMap((row) =>
        row.userId === null ? [] : [[row.userId, row.at] as const]
      )
    )

    return people.map((person) => ({
      ...person,
      lastAccessAt: latest(
        bySession.get(person.userId) ?? null,
        byLogin.get(person.userId) ?? null
      ),
    }))
  }
}

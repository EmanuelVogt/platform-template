import { Injectable } from "@nestjs/common"
import { sql } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { RefLabelReader, RefTarget } from "../../domain/ports/ref-label.reader"

/**
 * Leitura display-only cruzando schemas de outros módulos (SELECT id+label).
 * Exceção consciente ao acesso via facade: a trilha é cross-cutting e o alvo
 * é um par (id, nome) sem regra de negócio. Ver ADR 0047.
 */
@Injectable()
export class DrizzleRefLabelReader implements RefLabelReader {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async findLabels(
    target: RefTarget,
    ids: readonly string[]
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const res = await this.db.execute(
      sql`SELECT id, ${sql.identifier(target.labelColumn)} AS label
          FROM ${sql.identifier(target.schema)}.${sql.identifier(target.table)}
          WHERE id IN ${[...ids]}`
    )
    const labels = new Map<string, string>()
    for (const row of res.rows as { id: string; label: string | null }[]) {
      if (row.label !== null) labels.set(row.id, row.label)
    }
    return labels
  }
}

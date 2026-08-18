import { Inject, Injectable } from "@nestjs/common"

import { activityAreaOf } from "../../application/activity-area"
import {
  ACTIVITY_STATS_READER,
  type ActivityStatsReader,
  type ActivityStatsWindow,
} from "../../domain/ports/activity-stats.reader"

export type AreaActivityRow = {
  areaKey: string
  areaLabel: string
  bucket: Date
  count: number
}

/**
 * Superfície pública do audit para o painel de uso (issue #36): quanto a equipe
 * alterou, por assunto do sistema e por período. O nome de tabela não sai daqui
 * — o mapa tabela→assunto é do audit. Roda na transação do chamador.
 */
@Injectable()
export class UsageActivityFacade {
  constructor(
    @Inject(ACTIVITY_STATS_READER)
    private readonly stats: ActivityStatsReader
  ) {}

  async countActivityByArea(
    window: ActivityStatsWindow
  ): Promise<AreaActivityRow[]> {
    const rows = await this.stats.countByTableAndBucket(window)
    return rows.map((row) => {
      const area = activityAreaOf(row.tableName)
      return {
        areaKey: area.key,
        areaLabel: area.label,
        bucket: row.bucket,
        count: row.count,
      }
    })
  }
}

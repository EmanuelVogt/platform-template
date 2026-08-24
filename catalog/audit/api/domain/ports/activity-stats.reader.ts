export type ActivityBucketUnit = "day" | "week"

export type ActivityStatsWindow = {
  from: Date
  to: Date
  unit: ActivityBucketUnit
}

export type TableActivityRow = {
  tableName: string
  bucket: Date
  count: number
}

export interface ActivityStatsReader {
  /** Alterações por tabela e bucket de tempo, já somadas no banco e restritas
   *  ao que gente fez pela tela — rotina automática fica de fora. */
  countByTableAndBucket(
    window: ActivityStatsWindow
  ): Promise<TableActivityRow[]>
}

export const ACTIVITY_STATS_READER: unique symbol = Symbol(
  "ActivityStatsReader"
)

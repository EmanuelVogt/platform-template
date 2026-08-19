import type { AccessProfile } from "../access/permission.types"

export type UsageBucketUnit = "day" | "week"

export type UsageBucketWindow = {
  from: Date
  to: Date
  unit: UsageBucketUnit
}

export type LoginBucketRow = { bucket: Date; count: number }

export type UserInactivityRow = {
  userId: string
  name: string
  accessProfile: AccessProfile
  lastAccessAt: Date | null
  createdAt: Date
}

export interface UsageStatsReader {
  /** Entradas bem-sucedidas por bucket, já somadas no banco. Bucket sem
   *  nenhuma entrada não retorna linha — quem densifica é o chamador. */
  countLoginsByBucket(window: UsageBucketWindow): Promise<LoginBucketRow[]>

  /** Colaboradores não excluídos com o último sinal de vida: a sessão mais
   *  recente ou, sem sessão, a última entrada registrada na trilha de acesso.
   *  `lastAccessAt` nulo = nunca acessou. */
  listUserInactivity(): Promise<UserInactivityRow[]>
}

export const USAGE_STATS_READER: unique symbol = Symbol("UsageStatsReader")

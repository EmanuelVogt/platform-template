import { Inject, Injectable } from "@nestjs/common"

import {
  USAGE_STATS_READER,
  type LoginBucketRow,
  type UsageBucketWindow,
  type UsageStatsReader,
  type UserInactivityRow,
} from "../../domain/ports/usage-stats.reader"

export type { UserInactivityRow } from "../../domain/ports/usage-stats.reader"

/**
 * Superfície pública do identity para o painel de uso (issue #36): entradas no
 * sistema por período e tempo sem acessar por colaborador. Só leitura agregada
 * — roda na transação do chamador. Ver ADR 0034 (padrão anti-forwardRef).
 */
@Injectable()
export class UsageAccessFacade {
  constructor(
    @Inject(USAGE_STATS_READER) private readonly stats: UsageStatsReader
  ) {}

  countLoginsByBucket(window: UsageBucketWindow): Promise<LoginBucketRow[]> {
    return this.stats.countLoginsByBucket(window)
  }

  listUserInactivity(): Promise<UserInactivityRow[]> {
    return this.stats.listUserInactivity()
  }
}

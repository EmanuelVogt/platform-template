import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common"
import { Pool } from "pg"

import {
  type AppLogger,
  LoggerFactory,
} from "../../kernel/logging/logger.factory"

import { DedicatedClientFactory } from "./dedicated-client.factory"
import { createDrizzle, createPool, DRIZZLE, PG_POOL } from "./drizzle.provider"
import { PoolMetrics } from "./pool-metrics"

import type { DrizzleSchema } from "./drizzle.provider"

@Injectable()
class DatabaseConnection implements OnModuleInit, OnApplicationShutdown {
  private readonly log: AppLogger

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    loggerFactory: LoggerFactory,
  ) {
    this.log = loggerFactory.forModule("DatabaseConnection")
  }

  onModuleInit(): void {
    // pg emite 'error' em conexão idle caída (restart/failover): sem listener o
    // EventEmitter lança não-tratado e derruba o processo. Loga só err.message
    // (nunca o err inteiro nem a connectionString — evita vazar credencial).
    this.pool.on("error", (err) => {
      this.log.error("pg.pool_error", { err: err.message })
    })
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot({ schema }: { schema: DrizzleSchema }): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: PG_POOL,
          useFactory: (loggerFactory: LoggerFactory) =>
            createPool(loggerFactory.forModule("ApplicationPool")),
          inject: [LoggerFactory],
        },
        {
          provide: DRIZZLE,
          useFactory: (pool: Pool) => createDrizzle(pool, schema),
          inject: [PG_POOL],
        },
        {
          provide: DedicatedClientFactory,
          useFactory: (loggerFactory: LoggerFactory) =>
            new DedicatedClientFactory(
              loggerFactory.forModule("DedicatedClientFactory")
            ),
          inject: [LoggerFactory],
        },
        DatabaseConnection,
        PoolMetrics,
      ],
      exports: [DRIZZLE, PG_POOL, DedicatedClientFactory],
    }
  }
}

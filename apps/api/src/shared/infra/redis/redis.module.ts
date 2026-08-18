import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common"

import {
  type AppLogger,
  LoggerFactory,
} from "../../kernel/logging/logger.factory"

import { createRedis, REDIS_CLIENT } from "./redis.provider"

import type Redis from "ioredis"

@Injectable()
export class RedisConnection implements OnModuleInit, OnApplicationShutdown {
  private readonly log: AppLogger

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    loggerFactory: LoggerFactory,
  ) {
    this.log = loggerFactory.forModule("RedisConnection")
  }

  onModuleInit(): void {
    // ioredis emite 'error' em falha de conexão/reconexão. Nível warn (não
    // error): o rate-limiter já trata indisponibilidade com fail-open — Redis
    // fora é degradação tolerada. Loga só err.message (sem URL/credencial).
    this.redis.on("error", (err: Error) => {
      this.log.warn("redis.client_error", { err: err.message })
    })
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit()
    } catch {
      // quit() rejeita se o socket ainda não completou o handshake — com
      // enableOfflineQueue: false o QUIT não enfileira (ex.: export de OpenAPI,
      // que fecha o app logo após o boot). Sem conexão não há o que encerrar
      // graciosamente: disconnect() fecha o socket e é o suficiente.
      this.redis.disconnect()
    }
  }
}

@Global()
@Module({
  providers: [{ provide: REDIS_CLIENT, useFactory: createRedis }, RedisConnection],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

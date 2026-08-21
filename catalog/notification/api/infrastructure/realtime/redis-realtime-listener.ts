import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common"

import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"

import { NOTIF_REALTIME_CHANNEL } from "./realtime-channel"
import { NOTIF_REDIS_SUBSCRIBER } from "./redis-subscriber.provider"
import { SseConnectionRegistry } from "./sse-connection-registry"

import type Redis from "ioredis"

/** Ponte Redis → registry local. ioredis re-subscreve sozinho após reconnect. */
@Injectable()
export class RedisRealtimeListener
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly log: AppLogger

  constructor(
    @Inject(NOTIF_REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    private readonly registry: SseConnectionRegistry,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("RedisRealtimeListener")
  }

  onModuleInit(): void {
    this.subscriber.on("error", (err: Error) => {
      this.log.warn("notifications.subscriber_error", { err: err.message })
    })
    this.subscriber.on("message", (_channel: string, recipientId: string) => {
      this.registry.notifyNew(recipientId)
    })
    // Não aguarda: com o client lazy, a 1ª chamada de comando é quem abre o
    // socket. Aguardar aqui bloquearia o boot do Nest (NestFactory.create)
    // até a inscrição confirmar — travando ferramentas que só montam o grafo
    // (ex.: export de OpenAPI) contra um Redis inalcançável. O .catch evita
    // unhandled rejection se a inscrição falhar; erro já vai pro log via
    // listener "error" acima.
    this.subscriber.subscribe(NOTIF_REALTIME_CHANNEL).catch((err: unknown) => {
      this.log.warn("notifications.subscribe_failed", {
        err: err instanceof Error ? err.message : String(err),
      })
    })
  }

  async onApplicationShutdown(): Promise<void> {
    await this.subscriber.quit()
  }
}

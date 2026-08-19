import { Inject, Injectable } from "@nestjs/common"

import { REDIS_CLIENT } from "../../../../shared/infra/redis/redis.provider"

import { NOTIF_REALTIME_CHANNEL } from "./realtime-channel"

import type { RealtimePublisherPort } from "../../domain/ports/realtime-publisher.port"
import type Redis from "ioredis"

@Injectable()
export class RedisRealtimePublisher implements RealtimePublisherPort {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publishNew(recipientId: string): Promise<void> {
    // Roda no onCommit: falha (Redis fora, fail-fast do client) é capturada e
    // logada pelo runOnCommit — nudge perdido é tolerado por desenho.
    await this.redis.publish(NOTIF_REALTIME_CHANNEL, recipientId)
  }
}

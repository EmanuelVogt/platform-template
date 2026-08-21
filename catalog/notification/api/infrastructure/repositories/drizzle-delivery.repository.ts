import { Injectable } from "@nestjs/common"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { notificationDeliveries } from "../tables/notification-delivery.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type {
  DeliveryRepositoryPort,
  NewDelivery,
} from "../../domain/ports/delivery.repository.port"

@Injectable()
export class DrizzleDeliveryRepository implements DeliveryRepositoryPort {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async enqueue(deliveries: readonly NewDelivery[]): Promise<void> {
    if (deliveries.length === 0) {
      return
    }
    await this.db.insert(notificationDeliveries).values(
      deliveries.map((d) => ({
        id: d.id,
        notificationId: d.notificationId,
        recipientId: d.recipientId,
        type: d.type,
        channel: d.channel,
        payload: d.payload,
      }))
    )
  }
}

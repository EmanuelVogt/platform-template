import { OutboxDispatcher } from "../../../shared/kernel/outbox/outbox.dispatcher"
import { DeliveryDispatcher } from "../infrastructure/delivery/delivery.dispatcher"

import type { Pollable } from "../../../shared/test/e2e/outbox"
import type { INestApplication } from "@nestjs/common"

/** Os despachantes que um teste de notificação precisa girar: kernel
 *  (OutboxDispatcher) + entrada (DeliveryDispatcher) — o kernel nunca nomeia
 *  despachante de módulo (AD-025), então quem sabe o par é a própria entrada. */
export function DELIVERY_DISPATCHERS(app: INestApplication): Pollable[] {
  return [app.get(OutboxDispatcher), app.get(DeliveryDispatcher)]
}

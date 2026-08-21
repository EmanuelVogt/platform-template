export type DeliveryChannelKind = "email" | "push"

export type NewDelivery = {
  id: string
  notificationId: string | null
  recipientId: string
  type: string
  channel: DeliveryChannelKind
  payload: Record<string, unknown>
}

export interface DeliveryRepositoryPort {
  /** Enfileira na tx corrente — atômico com o write do in-app no handler. */
  enqueue(deliveries: readonly NewDelivery[]): Promise<void>
}

export const DELIVERY_REPOSITORY = Symbol("DELIVERY_REPOSITORY")

export type ChannelSendInput = {
  /** delivery.id — dobra como Idempotency-Key do provider. */
  id: string
  type: string
  payload: Record<string, unknown>
}

/** Canal de IO (email hoje; push é seam). Implementação 1 por canal. */
export interface ChannelPort {
  send(input: ChannelSendInput): Promise<void>
}

export const EMAIL_CHANNEL = Symbol("EMAIL_CHANNEL")

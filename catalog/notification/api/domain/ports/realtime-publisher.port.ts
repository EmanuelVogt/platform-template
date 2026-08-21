/** Nudge loss-tolerant: Redis fora = badge stale até o próximo GET. REST é a verdade. */
export interface RealtimePublisherPort {
  publishNew(recipientId: string): Promise<void>
}

export const REALTIME_PUBLISHER = Symbol("REALTIME_PUBLISHER")

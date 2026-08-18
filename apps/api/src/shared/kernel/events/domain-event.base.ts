import { ulid } from "ulid"

/** Envelope serializável persistido no outbox e entregue ao handler. */
export type EventEnvelope<P = unknown> = {
  eventId: string
  eventName: string
  eventVersion: number
  occurredAt: string
  aggregateId: string
  aggregateType: string
  correlationId: string
  causationId: string | null
  tenantId: string | null
  traceparent: string | null
  payload: P
}

export type DomainEventArgs<P> = {
  aggregateId: string
  aggregateType: string
  payload: P
  eventId?: string
  occurredAt?: string
}

/**
 * Base de evento de domínio. Carrega identidade + payload; os campos de
 * contexto (`correlationId`, `tenantId`, `traceparent`) entram no envelope no
 * momento do `publish`, lidos do RequestContext — nunca pelo caller.
 */
export abstract class DomainEvent<P = unknown> {
  abstract readonly eventName: string
  abstract readonly eventVersion: number

  readonly eventId: string
  readonly occurredAt: string
  readonly aggregateId: string
  readonly aggregateType: string
  readonly payload: P

  protected constructor(args: DomainEventArgs<P>) {
    this.eventId = args.eventId ?? ulid()
    this.occurredAt = args.occurredAt ?? new Date().toISOString()
    this.aggregateId = args.aggregateId
    this.aggregateType = args.aggregateType
    this.payload = args.payload
  }
}

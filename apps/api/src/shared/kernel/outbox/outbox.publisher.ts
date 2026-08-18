import { Injectable } from "@nestjs/common"

import { RequestContext } from "../context/request-context"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"
import { currentTraceparent } from "../tracing/event-trace-propagation"
import { TransactionManager } from "../transactional/transaction-manager"

import { outbox } from "./outbox.table"

import type {
  DomainEvent,
  EventEnvelope,
} from "../events/domain-event.base"

@Injectable()
export class OutboxPublisher {
  private readonly log: AppLogger

  constructor(
    private readonly tx: TransactionManager,
    private readonly ctx: RequestContext,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("OutboxPublisher")
  }

  /** Grava o evento no outbox na transação corrente. Sem tx aberta → throw. */
  async publish(event: DomainEvent): Promise<void> {
    if (!this.tx.isInTransaction()) {
      throw new Error("outbox.publish exige uma transação aberta")
    }
    const ctx = this.ctx.get()
    const envelope: EventEnvelope = {
      eventId: event.eventId,
      eventName: event.eventName,
      eventVersion: event.eventVersion,
      occurredAt: event.occurredAt,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      tenantId: ctx.tenantId,
      traceparent: currentTraceparent(),
      payload: event.payload,
    }

    await this.tx.getExecutor().insert(outbox).values({
      eventId: envelope.eventId,
      eventName: envelope.eventName,
      eventVersion: envelope.eventVersion,
      aggregateId: envelope.aggregateId,
      aggregateType: envelope.aggregateType,
      payload: envelope,
      correlationId: envelope.correlationId,
      causationId: envelope.causationId,
      tenantId: envelope.tenantId,
      traceparent: envelope.traceparent,
      occurredAt: new Date(envelope.occurredAt),
    })

    this.log.info("outbox.published", {
      eventId: envelope.eventId,
      eventName: envelope.eventName,
      aggregateId: envelope.aggregateId,
    })
  }
}

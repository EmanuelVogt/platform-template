import { ulid } from "ulid"

import { createTestDb, createTestPool } from "../../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../../test/setup/test-logger"
import { ProcessedEventsRepository } from "../../../../../shared/kernel/outbox/processed-events.repository"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { AllowAllPreferences } from "../../../infrastructure/preferences/allow-all.preferences"
import { DrizzleDeliveryRepository } from "../../../infrastructure/repositories/drizzle-delivery.repository"
import { DrizzleNotificationRepository } from "../../../infrastructure/repositories/drizzle-notification.repository"
import { NotificationTemplateSourceRegistry } from "../../templates/notification-template-registry"

import { NotificationRequestedHandler } from "./notification-requested.handler"

import type { DrizzleDb } from "../../../../../shared/infra/database/drizzle.provider"
import type { EventEnvelope } from "../../../../../shared/kernel/events/domain-event.base"
import type { NotificationRequestedPayload } from "../../../api/events/notification-requested.event"
import type { RealtimePublisherPort } from "../../../domain/ports/realtime-publisher.port"
import type { Pool } from "pg"

function envelopeOf(
  payload: NotificationRequestedPayload
): EventEnvelope<NotificationRequestedPayload> {
  return {
    eventId: ulid(),
    eventName: "notification.requested",
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    aggregateId: payload.recipientId,
    aggregateType: "Notification",
    correlationId: "corr-int",
    causationId: null,
    tenantId: null,
    traceparent: null,
    payload,
  }
}

describe("NotificationRequestedHandler (int)", () => {
  let pool: Pool
  let db: DrizzleDb
  let handler: NotificationRequestedHandler
  let notifications: DrizzleNotificationRepository
  const publishNew = jest.fn().mockResolvedValue(undefined)
  const realtime: jest.Mocked<RealtimePublisherPort> = { publishNew }

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const { loggerFactory } = makeTestLogger()
    const txm = new TransactionManager(db, loggerFactory)
    txm.onModuleInit()
    notifications = new DrizzleNotificationRepository(txm)
    handler = new NotificationRequestedHandler(
      new ProcessedEventsRepository(txm),
      notifications,
      new DrizzleDeliveryRepository(txm),
      new AllowAllPreferences(),
      txm,
      realtime,
      new NotificationTemplateSourceRegistry(),
      loggerFactory
    )
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(async () => {
    await pool.query("truncate table notification.notifications")
    await pool.query("truncate table notification.notification_deliveries")
    await pool.query("truncate table _kernel.processed_events")
    publishNew.mockClear()
  })

  it("email-only: enfileira delivery sem linha in-app", async () => {
    await handler.handle(
      envelopeOf({
        recipientId: "u1",
        type: "account_lockout",
        locale: "pt-BR",
        data: { email: "a@b.com" },
      })
    )
    const deliveries = await pool.query(
      "select * from notification.notification_deliveries"
    )
    expect(deliveries.rowCount).toBe(1)
    expect(deliveries.rows[0]).toMatchObject({
      recipient_id: "u1",
      type: "account_lockout",
      channel: "email",
      status: "pending",
      notification_id: null,
    })
    expect(deliveries.rows[0].payload).toMatchObject({
      email: "a@b.com",
      locale: "pt-BR",
    })
    const inapp = await pool.query("select * from notification.notifications")
    expect(inapp.rowCount).toBe(0)
    // email-only não grava in-app → sem nudge.
    expect(publishNew).not.toHaveBeenCalled()
  })

  it("email+inapp: grava feed e delivery na mesma tx, com metadata projetada", async () => {
    await handler.handle(
      envelopeOf({
        recipientId: "u1",
        type: "password_changed",
        locale: "pt-BR",
        data: { email: "a@b.com", at: "2026-06-10T12:00:00.000Z" },
      })
    )
    const inapp = await pool.query("select * from notification.notifications")
    expect(inapp.rowCount).toBe(1)
    expect(inapp.rows[0]).toMatchObject({
      recipient_id: "u1",
      type: "password_changed",
      title: "Senha alterada",
    })
    expect(inapp.rows[0].metadata).toEqual({ at: "2026-06-10T12:00:00.000Z" })
    const deliveries = await pool.query(
      "select * from notification.notification_deliveries"
    )
    expect(deliveries.rows[0].notification_id).toBe(inapp.rows[0].id)
    // nudge dispara só pós-commit, 1x, com o recipient.
    expect(publishNew).toHaveBeenCalledTimes(1)
    expect(publishNew).toHaveBeenCalledWith("u1")
  })

  it("é idempotente por eventId (markIfNew)", async () => {
    const envelope = envelopeOf({
      recipientId: "u1",
      type: "account_lockout",
      locale: "pt-BR",
      data: { email: "a@b.com" },
    })
    await handler.handle(envelope)
    await handler.handle(envelope)
    const deliveries = await pool.query(
      "select count(*)::int as n from notification.notification_deliveries"
    )
    expect(deliveries.rows[0].n).toBe(1)
  })

  it("data inválida → throw (tx aborta, marca desfeita, outbox reentrega)", async () => {
    const envelope = envelopeOf({
      recipientId: "u1",
      type: "account_lockout",
      locale: "pt-BR",
      data: {},
    })
    await expect(handler.handle(envelope)).rejects.toThrow()
    const processed = await pool.query(
      "select count(*)::int as n from _kernel.processed_events"
    )
    expect(processed.rows[0].n).toBe(0)
  })
})

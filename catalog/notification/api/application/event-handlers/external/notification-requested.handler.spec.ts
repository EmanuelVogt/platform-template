import { ulid } from "ulid"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { defineCatalogEntry } from "../../catalog/notification-catalog"
import { NotificationTemplateSourceRegistry } from "../../templates/notification-template-registry"

import { NotificationRequestedHandler } from "./notification-requested.handler"

import type { EventEnvelope } from "../../../../../shared/kernel/events/domain-event.base"
import type { LoggerFactory } from "../../../../../shared/kernel/logging/logger.factory"
import type { ProcessedEventsRepository } from "../../../../../shared/kernel/outbox/processed-events.repository"
import type { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import type { NotificationRequestedPayload } from "../../../api/events/notification-requested.event"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

const loggerFactory = {
  forModule: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
} as unknown as LoggerFactory

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
    correlationId: "corr-unit",
    causationId: null,
    tenantId: null,
    traceparent: null,
    payload,
  }
}

function makeDeps(
  over: Partial<{
    markIfNew: boolean
    allowed: string[]
    templateSources: NotificationTemplateSourceRegistry
  }> = {}
) {
  const templateSources = over.templateSources ?? new NotificationTemplateSourceRegistry()
  const markIfNew = vi.fn().mockResolvedValue(over.markIfNew ?? true)
  const insert = vi.fn().mockResolvedValue(undefined)
  const enqueue = vi.fn().mockResolvedValue(undefined)
  const allowedChannels = vi
    .fn()
    .mockResolvedValue(over.allowed ?? ["system", "email", "push"])
  const onCommit = vi.fn()
  const publishNew = vi.fn().mockResolvedValue(undefined)
  const handler = new NotificationRequestedHandler(
    { markIfNew } as unknown as ProcessedEventsRepository,
    { insert } as unknown as NotificationRepositoryPort,
    { enqueue },
    { allowedChannels },
    { onCommit } as unknown as TransactionManager,
    { publishNew },
    templateSources,
    loggerFactory,
  )
  return { handler, markIfNew, insert, enqueue, allowedChannels, onCommit, publishNew }
}

const passwordSet = () =>
  envelopeOf({
    recipientId: "admin-1",
    type: "password_set",
    locale: "pt-BR",
    data: { userName: "Ana" },
  })

describe("NotificationRequestedHandler", () => {
  it("evento duplicado (markIfNew=false) não toca repos", async () => {
    const t = makeDeps({ markIfNew: false })
    await t.handler.handle(passwordSet())
    expect(t.insert).not.toHaveBeenCalled()
    expect(t.enqueue).not.toHaveBeenCalled()
  })

  it("tipo fora do catálogo → throw (retry/dead-letter do outbox)", async () => {
    const t = makeDeps()
    const envelope = passwordSet()
    await expect(
      t.handler.handle({
        ...envelope,
        payload: { ...envelope.payload, type: "tipo_inexistente" as never },
      }),
    ).rejects.toThrow(/fora do catálogo/)
    expect(t.insert).not.toHaveBeenCalled()
  })

  it("tipo contribuído por outro módulo é entregue pela entrada da fonte registrada", async () => {
    const templateSources = new NotificationTemplateSourceRegistry()
    templateSources.register({
      type: "tipo_do_produto" as never,
      catalog: defineCatalogEntry({
        category: "informational",
        channels: ["email"],
        dataSchema: z.object({ email: z.email() }),
      }),
      email: {
        template: "produto",
        templateDir: "/tmp/produto",
        subject: () => "assunto do produto",
      },
    })
    const t = makeDeps({ templateSources })

    await t.handler.handle(
      envelopeOf({
        recipientId: "u9",
        type: "tipo_do_produto" as never,
        locale: "pt-BR",
        data: { email: "a@b.com" },
      }),
    )

    expect(t.insert).not.toHaveBeenCalled()
    expect(t.enqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientId: "u9",
        type: "tipo_do_produto",
        channel: "email",
        notificationId: null,
        payload: { email: "a@b.com", locale: "pt-BR" },
      }),
    ])
  })

  it("informational respeita preferences: sem 'system' permitido → nada gravado", async () => {
    const t = makeDeps({ allowed: ["email"] })
    await t.handler.handle(passwordSet())
    expect(t.insert).not.toHaveBeenCalled()
    expect(t.enqueue).not.toHaveBeenCalled()
    expect(t.onCommit).not.toHaveBeenCalled()
  })

  it("security IGNORA preferences: password_changed grava in-app e enfileira e-mail", async () => {
    const t = makeDeps({ allowed: [] })
    await t.handler.handle(
      envelopeOf({
        recipientId: "u1",
        type: "password_changed",
        locale: "pt-BR",
        data: { email: "a@b.com", at: "2026-06-10T00:00:00.000Z" },
      }),
    )
    expect(t.insert).toHaveBeenCalledTimes(1)
    expect(t.enqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientId: "u1",
        type: "password_changed",
        channel: "email",
        notificationId: expect.any(String),
        payload: { email: "a@b.com", at: "2026-06-10T00:00:00.000Z", locale: "pt-BR" },
      }),
    ])
  })

  it("nudge SSE registrado via onCommit só quando grava in-app", async () => {
    const t = makeDeps()
    await t.handler.handle(passwordSet())
    expect(t.onCommit).toHaveBeenCalledTimes(1)
    const cb = t.onCommit.mock.calls[0]?.[0] as () => Promise<void>
    await cb()
    expect(t.publishNew).toHaveBeenCalledWith("admin-1")
  })

  it("email-only (access_link_sent) não grava in-app nem registra nudge", async () => {
    const t = makeDeps()
    await t.handler.handle(
      envelopeOf({
        recipientId: "u1",
        type: "access_link_sent",
        locale: "pt-BR",
        data: {
          email: "a@b.com",
          name: "Ana",
          link: "https://app.local/configurar-senha?token=raw",
          tokenExpiresAt: "2099-01-01T00:00:00.000Z",
        },
      }),
    )
    expect(t.insert).not.toHaveBeenCalled()
    expect(t.onCommit).not.toHaveBeenCalled()
    expect(t.enqueue).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "email", notificationId: null }),
    ])
  })
})

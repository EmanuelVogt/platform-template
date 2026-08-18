import { Inject, Injectable } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { ulid } from "ulid"

import {
  type AppLogger,
  LoggerFactory,
} from "../../../../../shared/kernel/logging/logger.factory"
import { ProcessedEventsRepository } from "../../../../../shared/kernel/outbox/processed-events.repository"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { NotificationRequested } from "../../../api/events/notification-requested.event"
import { Notification } from "../../../domain/entities/notification.entity"
import {
  DELIVERY_REPOSITORY,
  type DeliveryChannelKind,
  type DeliveryRepositoryPort,
} from "../../../domain/ports/delivery.repository.port"
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepositoryPort,
} from "../../../domain/ports/notification.repository.port"
import {
  NOTIFICATION_PREFERENCES,
  type NotificationPreferencesPort,
} from "../../../domain/ports/preferences.port"
import {
  REALTIME_PUBLISHER,
  type RealtimePublisherPort,
} from "../../../domain/ports/realtime-publisher.port"
import { NotificationTemplateSourceRegistry } from "../../templates/notification-template-registry"

import type { EventEnvelope } from "../../../../../shared/kernel/events/domain-event.base"
import type { NotificationRequestedPayload } from "../../../api/events/notification-requested.event"

// Convenção <module>:<handler-id> (§282) — estável: renomear re-executa eventos.
const CONSUMER = "notification:requested"

/** Consome o comando cross-module: grava in-app e enfileira IO na MESMA tx. */
@Injectable()
export class NotificationRequestedHandler {
  private readonly log: AppLogger

  constructor(
    private readonly processed: ProcessedEventsRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepositoryPort,
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveries: DeliveryRepositoryPort,
    @Inject(NOTIFICATION_PREFERENCES)
    private readonly preferences: NotificationPreferencesPort,
    private readonly txm: TransactionManager,
    @Inject(REALTIME_PUBLISHER)
    private readonly realtime: RealtimePublisherPort,
    private readonly templateSources: NotificationTemplateSourceRegistry,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("NotificationRequested")
  }

  @OnEvent(NotificationRequested.EVENT_NAME)
  @Transactional()
  @Traced({ name: "notification.requested" })
  async handle(
    envelope: EventEnvelope<NotificationRequestedPayload>
  ): Promise<void> {
    const novel = await this.processed.markIfNew(envelope.eventId, CONSUMER)
    if (!novel) {
      return
    }

    const { recipientId, type, locale } = envelope.payload
    // type vem do payload deserializado do outbox (boundary externo): o tipo
    // promete NotificationType, mas em runtime pode ser um tipo fora do catálogo.
    const entry = this.templateSources.find(type)?.catalog
    if (!entry) {
      // throw → retry/dead-letter do outbox sinaliza catálogo desatualizado.
      throw new Error(`tipo de notificação fora do catálogo: ${type}`)
    }
    const data = entry.dataSchema.parse(envelope.payload.data)

    const allowed = await this.preferences.allowedChannels(recipientId, type)
    // Categoria mandatória (security/transactional) ignora preferências.
    const channels =
      entry.category === "informational"
        ? entry.channels.filter((c) => allowed.includes(c))
        : [...entry.channels]

    let notificationId: string | null = null
    if (channels.includes("system") && entry.renderInApp) {
      const rendered = entry.renderInApp(data)
      const notification = Notification.create({
        recipientId,
        type,
        title: rendered.title,
        body: rendered.body,
        actions: rendered.actions,
        metadata: entry.metadata?.(data) ?? {},
        locale,
      })
      await this.notifications.insert(notification)
      notificationId = notification.props.id
      // onCommit DEVE ser chamado dentro do escopo @Transactional (lança fora
      // de tx); dispara pós-commit, com a linha in-app já persistida.
      this.txm.onCommit(() => this.realtime.publishNew(recipientId))
    }

    const io = channels.filter((c): c is DeliveryChannelKind => c !== "system")
    if (io.length > 0) {
      await this.deliveries.enqueue(
        io.map((channel) => ({
          id: ulid(),
          notificationId,
          recipientId,
          type,
          channel,
          payload: { ...data, locale },
        }))
      )
    }
    this.log.info("notification.requested_handled", {
      type,
      channels,
      hasInApp: notificationId !== null,
    })
  }
}

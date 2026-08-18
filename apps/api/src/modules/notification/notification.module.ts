import { Module } from "@nestjs/common"

import { LoggerFactory } from "../../shared/kernel/logging/logger.factory"

import { CONTROLLERS } from "./api/controllers"
import { NotificationRequestedHandler } from "./application/event-handlers/external/notification-requested.handler"
import { NotificationMapper } from "./application/mappers/notification.mapper"
import { NotificationTemplateSourceRegistry } from "./application/templates/notification-template-registry"
import { ArchiveNotificationUseCase } from "./application/use-cases/archive-notification/archive-notification.use-case"
import { GetUnseenCountUseCase } from "./application/use-cases/get-unseen-count/get-unseen-count.use-case"
import { ListNotificationsUseCase } from "./application/use-cases/list-notifications/list-notifications.use-case"
import { MarkAllReadUseCase } from "./application/use-cases/mark-all-read/mark-all-read.use-case"
import { MarkAllSeenUseCase } from "./application/use-cases/mark-all-seen/mark-all-seen.use-case"
import { MarkReadUseCase } from "./application/use-cases/mark-read/mark-read.use-case"
import { EMAIL_CHANNEL } from "./domain/ports/channel.port"
import { DELIVERY_REPOSITORY } from "./domain/ports/delivery.repository.port"
import { MAILER } from "./domain/ports/mailer"
import { NOTIFICATION_TEMPLATE_SOURCES } from "./domain/ports/notification-template-source.port"
import { NOTIFICATION_REPOSITORY } from "./domain/ports/notification.repository.port"
import { NOTIFICATION_PREFERENCES } from "./domain/ports/preferences.port"
import { REALTIME_PUBLISHER } from "./domain/ports/realtime-publisher.port"
import { TEMPLATE_RENDERER } from "./domain/ports/template-renderer"
import { EmailChannel } from "./infrastructure/channels/email.channel"
import { DeliveryDispatcher } from "./infrastructure/delivery/delivery.dispatcher"
import { HandlebarsTemplateRenderer } from "./infrastructure/mailer/handlebars-template-renderer"
import { LogMailer } from "./infrastructure/mailer/log-mailer"
import { ResendMailer } from "./infrastructure/mailer/resend-mailer"
import { AllowAllPreferences } from "./infrastructure/preferences/allow-all.preferences"
import { RedisRealtimeListener } from "./infrastructure/realtime/redis-realtime-listener"
import { RedisRealtimePublisher } from "./infrastructure/realtime/redis-realtime-publisher"
import {
  createNotifSubscriber,
  NOTIF_REDIS_SUBSCRIBER,
} from "./infrastructure/realtime/redis-subscriber.provider"
import { SseConnectionRegistry } from "./infrastructure/realtime/sse-connection-registry"
import { DrizzleDeliveryRepository } from "./infrastructure/repositories/drizzle-delivery.repository"
import { DrizzleNotificationRepository } from "./infrastructure/repositories/drizzle-notification.repository"
import {
  loadNotificationConfig,
  NOTIFICATIONS_CONFIG,
} from "./notification.config"

import type { NotificationConfig } from "./notification.config"

// SharedKernelModule é @Global — Transactional/Outbox/Clock/Redis não se reimporta.
@Module({
  controllers: CONTROLLERS,
  providers: [
    NotificationTemplateSourceRegistry,
    { provide: NOTIFICATION_TEMPLATE_SOURCES, useExisting: NotificationTemplateSourceRegistry },
    { provide: NOTIFICATIONS_CONFIG, useFactory: loadNotificationConfig },
    { provide: NOTIFICATION_REPOSITORY, useClass: DrizzleNotificationRepository },
    { provide: DELIVERY_REPOSITORY, useClass: DrizzleDeliveryRepository },
    { provide: NOTIFICATION_PREFERENCES, useClass: AllowAllPreferences },
    { provide: EMAIL_CHANNEL, useClass: EmailChannel },
    NotificationRequestedHandler,
    DeliveryDispatcher,
    NotificationMapper,
    ListNotificationsUseCase,
    GetUnseenCountUseCase,
    MarkAllSeenUseCase,
    MarkAllReadUseCase,
    MarkReadUseCase,
    ArchiveNotificationUseCase,
    SseConnectionRegistry,
    RedisRealtimeListener,
    { provide: NOTIF_REDIS_SUBSCRIBER, useFactory: createNotifSubscriber },
    { provide: REALTIME_PUBLISHER, useClass: RedisRealtimePublisher },
    { provide: TEMPLATE_RENDERER, useClass: HandlebarsTemplateRenderer },
    {
      provide: MAILER,
      useFactory: (
        cfg: NotificationConfig,
        lf: LoggerFactory,
        renderer: HandlebarsTemplateRenderer,
      ): LogMailer | ResendMailer => {
        if (cfg.MAIL_TRANSPORT === "resend") {
          if (cfg.RESEND_API_KEY === undefined || cfg.MAIL_FROM === undefined) {
            throw new Error("MAIL_TRANSPORT=resend exige RESEND_API_KEY e MAIL_FROM")
          }
          return new ResendMailer(
            { apiKey: cfg.RESEND_API_KEY, from: cfg.MAIL_FROM },
            renderer,
          )
        }
        // LogMailer registra o link (token raw) — proibido em produção.
        if (cfg.NODE_ENV === "production") {
          throw new Error("MAIL_TRANSPORT=log proibido em produção; use resend")
        }
        return new LogMailer(lf)
      },
      inject: [
        NOTIFICATIONS_CONFIG,
        LoggerFactory,
        TEMPLATE_RENDERER,
      ],
    },
  ],
  exports: [NotificationTemplateSourceRegistry],
})
export class NotificationModule {}

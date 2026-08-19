import { Module } from "@nestjs/common"
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { ScheduleModule } from "@nestjs/schedule"
import { ZodValidationPipe } from "nestjs-zod"

import * as schema from "./db/schema"
import { PLATFORM_MODULES } from "./platform-modules"
import { AttachmentModule } from "./modules/attachment/attachment.module"
import { AuditModule } from "./modules/audit/audit.module"
import { IdentityModule } from "./modules/identity/identity.module"
import { NotificationModule } from "./modules/notification/notification.module"
import { TagModule } from "./modules/tag/tag.module"
import { DatabaseModule } from "./shared/infra/database/database.module"
import { StorageModule } from "./shared/infra/storage/storage.module"
import { AuditTrailModule } from "./shared/kernel/audit/audit-trail.module"
import { ProblemDetailsFilter } from "./shared/kernel/errors/problem-details.filter"
import { HealthModule } from "./shared/kernel/health/health.module"
import { IdempotencyInterceptor } from "./shared/kernel/idempotency/idempotency.interceptor"
import { LogInterceptor } from "./shared/kernel/logging/log.interceptor"
import { SharedKernelModule } from "./shared/kernel/shared-kernel.module"

// Composition root: os módulos de produto entram aqui, depois do base-set.
// `IdentityModule.forRoot()` sem argumentos usa os adapters nulos do slot
// profissional; um produto que tenha o conceito passa `{ professional: {...} }`.
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule.forRoot({ schema }),
    SharedKernelModule,
    AuditTrailModule,
    HealthModule,
    StorageModule,
    ...PLATFORM_MODULES,
    AttachmentModule,
    IdentityModule.forRoot(),
    NotificationModule,
    TagModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: LogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}

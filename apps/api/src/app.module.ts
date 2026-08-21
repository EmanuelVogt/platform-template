import { Module } from "@nestjs/common"
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { ScheduleModule } from "@nestjs/schedule"
import { ZodValidationPipe } from "nestjs-zod"

import * as schema from "./db/schema"
import { PLATFORM_MODULES } from "./platform-modules"
import { DatabaseModule } from "./shared/infra/database/database.module"
import { StorageModule } from "./shared/infra/storage/storage.module"
import { ProblemDetailsFilter } from "./shared/kernel/errors/problem-details.filter"
import { HealthModule } from "./shared/kernel/health/health.module"
import { IdempotencyInterceptor } from "./shared/kernel/idempotency/idempotency.interceptor"
import { LogInterceptor } from "./shared/kernel/logging/log.interceptor"
import { SharedKernelModule } from "./shared/kernel/shared-kernel.module"

// Composition root: o kernel sobe sozinho. As entradas instaladas do catálogo
// entram por `PLATFORM_MODULES` (gerado pelo `pnpm platform module`) e as do
// produto, depois delas.
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule.forRoot({ schema }),
    SharedKernelModule,
    HealthModule,
    StorageModule,
    ...PLATFORM_MODULES,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: LogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}

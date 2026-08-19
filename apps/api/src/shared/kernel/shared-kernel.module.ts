import { Global, Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"

import { RedisModule } from "../infra/redis/redis.module"

import { AccessGuard } from "./access/access.guard"
import { ClockModule } from "./clock/clock.module"
import { ContextModule } from "./context/context.module"
import { IdempotencyModule } from "./idempotency/idempotency.module"
import { LoggingModule } from "./logging/logging.module"
import { OutboxModule } from "./outbox/outbox.module"
import { SchedulingModule } from "./scheduling/scheduling.module"
import { TracingModule } from "./tracing/tracing.module"
import { TransactionalModule } from "./transactional/transactional.module"

/**
 * Agregador do kernel, importado SÓ pelo AppModule. Cada sub-módulo é @Global,
 * então módulo de negócio não importa nada disto — os providers chegam pelo
 * container. AuditTrail, Health, Coexistence e Database não entram aqui: sobem
 * por fora, direto no AppModule (o Coexistence de propósito — o guard dele
 * precisa registrar depois dos quatro do identity; o Database porque o
 * `forRoot` recebe o schema do app, que o kernel não conhece).
 */
@Global()
@Module({
  imports: [
    RedisModule,
    ContextModule,
    LoggingModule,
    TransactionalModule,
    OutboxModule,
    IdempotencyModule,
    SchedulingModule,
    TracingModule,
    ClockModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
  exports: [
    RedisModule,
    ContextModule,
    LoggingModule,
    TransactionalModule,
    OutboxModule,
    IdempotencyModule,
    ClockModule,
  ],
})
export class SharedKernelModule {}

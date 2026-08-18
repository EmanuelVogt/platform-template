import { Global, Module } from "@nestjs/common"

import { IdempotencyCleanup } from "./idempotency.cleanup"
import { IdempotencyRepository } from "./idempotency.repository"

@Global()
@Module({
  providers: [IdempotencyRepository, IdempotencyCleanup],
  exports: [IdempotencyRepository],
})
export class IdempotencyModule {}

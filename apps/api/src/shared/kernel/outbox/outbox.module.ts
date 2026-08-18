import { Global, Module } from "@nestjs/common"

import { OutboxDispatcher } from "./outbox.dispatcher"
import { OutboxPublisher } from "./outbox.publisher"
import { ProcessedEventsRepository } from "./processed-events.repository"

@Global()
@Module({
  providers: [OutboxPublisher, ProcessedEventsRepository, OutboxDispatcher],
  exports: [OutboxPublisher, ProcessedEventsRepository],
})
export class OutboxModule {}

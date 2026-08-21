import type { MessageEvent } from "@nestjs/common"
import type { Observable } from "rxjs"

export type SseConnection = {
  stream: Observable<MessageEvent>
  close(): void
}

export interface ConnectionRegistryPort {
  register(recipientId: string): SseConnection
  notifyNew(recipientId: string): void
}

export const CONNECTION_REGISTRY = Symbol("CONNECTION_REGISTRY")

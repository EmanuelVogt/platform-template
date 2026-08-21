import {
  Injectable,
  type MessageEvent,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common"
import { Subject } from "rxjs"

import type { ConnectionRegistryPort, SseConnection } from "../../domain/ports/connection-registry.port"

const MAX_CONNECTIONS_PER_USER = 5
const HEARTBEAT_INTERVAL_MS = 25_000

export type { SseConnection }

/** Conexões SSE em memória, por recipient. Process-local: o fan-out cross-instância é o Redis. */
@Injectable()
export class SseConnectionRegistry
  implements OnModuleInit, OnApplicationShutdown, ConnectionRegistryPort
{
  private readonly conns = new Map<string, Subject<MessageEvent>[]>()
  private heartbeat: ReturnType<typeof setInterval> | null = null

  onModuleInit(): void {
    // Proxies derrubam SSE idle; @Sse não emite comment-lines, então o
    // keep-alive é um evento "ping" que o front ignora.
    this.heartbeat = setInterval(() => {
      for (const subjects of this.conns.values()) {
        for (const s of subjects) {
          s.next({ data: { type: "ping" } })
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  onApplicationShutdown(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    for (const subjects of this.conns.values()) {
      for (const s of subjects) {
        s.complete()
      }
    }
    this.conns.clear()
  }

  register(recipientId: string): SseConnection {
    const subject = new Subject<MessageEvent>()
    const list = this.conns.get(recipientId) ?? []
    // Cap por usuário: a N+1ª conexão derruba a mais antiga (complete encerra o stream).
    if (list.length >= MAX_CONNECTIONS_PER_USER) {
      list.shift()?.complete()
    }
    list.push(subject)
    this.conns.set(recipientId, list)
    return {
      stream: subject.asObservable(),
      close: () => {
        subject.complete()
        const current = this.conns.get(recipientId) ?? []
        const next = current.filter((s) => s !== subject)
        if (next.length === 0) {
          this.conns.delete(recipientId)
        } else {
          this.conns.set(recipientId, next)
        }
      },
    }
  }

  notifyNew(recipientId: string): void {
    for (const s of this.conns.get(recipientId) ?? []) {
      s.next({ data: { type: "new" } })
    }
  }
}

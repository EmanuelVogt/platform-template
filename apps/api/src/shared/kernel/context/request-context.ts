import { AsyncLocalStorage } from "node:async_hooks"

import { Injectable } from "@nestjs/common"

/** Camada que abriu o contexto — carimba `origin` na trilha de auditoria. */
export type RequestOrigin = "http" | "event" | "job" | "backfill"

/** Permissões do ator carregadas pelo PermissionsGuard (one-shot, como userId). */
export type RequestAccess = {
  readonly permissions: ReadonlySet<string>
  readonly isMaster: boolean
}

export type RequestContextStore = {
  readonly requestId: string
  readonly correlationId: string
  readonly causationId: string | null
  readonly traceId: string | null
  readonly spanId: string | null
  readonly tenantId: string | null
  readonly origin: RequestOrigin
  // userId/sessionId/deviceId e access são a superfície de escrita pós-criação
  // (setUserSession one-shot pelo AuthGuard; setAccess one-shot pelo
  // PermissionsGuard). Os demais são readonly de fato.
  userId: string | null
  sessionId: string | null
  deviceId: string | null
  access: RequestAccess | null
  readonly locale: string
  readonly ip: string | null
  readonly userAgent: string | null
  readonly startedAt: number
}

@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<RequestContextStore>()

  run<T>(store: RequestContextStore, fn: () => T): T {
    return this.als.run(store, fn)
  }

  get(): RequestContextStore {
    const store = this.als.getStore()
    if (!store) {
      throw new Error("RequestContext acessado fora de um escopo de request")
    }
    return store
  }

  tryGet(): RequestContextStore | null {
    return this.als.getStore() ?? null
  }

  /**
   * Exceção controlada à imutabilidade do store: escrita one-shot null→valor
   * feita só pelo AuthGuard antes do handler. Demais campos são readonly de
   * fato, exceto `access` (ver setAccess). Re-escrita divergente de userId no
   * mesmo escopo lança.
   */
  setUserSession(
    userId: string,
    sessionId: string,
    deviceId: string | null
  ): void {
    const store = this.get()
    if (store.userId !== null && store.userId !== userId) {
      throw new Error("userId já definido no escopo")
    }
    store.userId = userId
    store.sessionId = sessionId
    store.deviceId = deviceId
  }

  /**
   * One-shot pelo PermissionsGuard. Mais estrito que setUserSession:
   * qualquer segunda chamada lança (setUserSession tolera re-set idêntico).
   */
  setAccess(access: RequestAccess): void {
    const store = this.get()
    if (store.access !== null) {
      throw new Error("access já definido no escopo")
    }
    store.access = access
  }
}

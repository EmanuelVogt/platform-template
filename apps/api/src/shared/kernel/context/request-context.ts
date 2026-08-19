import { AsyncLocalStorage } from "node:async_hooks"

import { Injectable } from "@nestjs/common"

/** Camada que abriu o contexto — carimba `origin` na trilha de auditoria. */
export type RequestOrigin = "http" | "event" | "job" | "backfill"

/**
 * @deprecated superfície do PermissionsGuard; some em T8/T9 junto de
 * `setAccess`. Use `setExtension`/`getExtension` com um símbolo do módulo.
 */
export type RequestAccess = {
  readonly permissions: ReadonlySet<string>
  readonly isMaster: boolean
}

/**
 * Ator opaco pro kernel: só `id` e `tenantId` são lidos aqui; `kind` e a
 * política de acesso pertencem ao módulo que define o ator.
 */
export type Actor = {
  readonly id: string
  readonly kind: string
  readonly tenantId?: string
}

export type RequestContextStore = {
  readonly requestId: string
  readonly correlationId: string
  readonly causationId: string | null
  readonly traceId: string | null
  readonly spanId: string | null
  readonly tenantId: string | null
  readonly origin: RequestOrigin
  // actor/extensions/sessionId/deviceId são a superfície de escrita
  // pós-criação (setActor one-shot; setExtension por símbolo do módulo). Os
  // demais são readonly de fato. Opcionais só até T8/T9 removerem os campos
  // deprecados abaixo, quando passam a obrigatórios.
  actor?: Actor | null
  extensions?: Map<symbol, unknown>
  sessionId: string | null
  deviceId: string | null
  /** @deprecated espelho de `actor.id`; removido em T8/T9. */
  userId: string | null
  /** @deprecated use `extensions`; removido em T8/T9. */
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
   * feita pelo middleware do módulo de identidade antes do handler. Qualquer
   * segunda chamada no mesmo escopo lança.
   */
  setActor(actor: Actor): void {
    const store = this.get()
    if (store.actor) {
      throw new Error("actor já definido no escopo")
    }
    store.actor = actor
    store.userId = actor.id
  }

  getActor(): Actor | null {
    return this.tryGet()?.actor ?? null
  }

  /**
   * Sacola de extensões do store, endereçada por símbolo do módulo dono: o
   * kernel guarda e devolve sem nunca ler o conteúdo.
   */
  setExtension<T>(key: symbol, value: T): void {
    const store = this.get()
    const extensions = store.extensions ?? new Map<symbol, unknown>()
    store.extensions = extensions
    extensions.set(key, value)
  }

  getExtension<T>(key: symbol): T | undefined {
    return this.tryGet()?.extensions?.get(key) as T | undefined
  }

  /**
   * @deprecated use `setActor`; removido em T8/T9. Mantém a tolerância a
   * re-set idêntico do AuthGuard atual, mais frouxa que `setActor`.
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
    store.actor = {
      id: userId,
      kind: "user",
      ...(store.tenantId === null ? {} : { tenantId: store.tenantId }),
    }
  }

  /** @deprecated use `getActor`; removido em T8/T9. */
  getUserSession(): {
    userId: string | null
    sessionId: string | null
    deviceId: string | null
  } {
    const store = this.tryGet()
    return {
      userId: store?.actor?.id ?? null,
      sessionId: store?.sessionId ?? null,
      deviceId: store?.deviceId ?? null,
    }
  }

  /**
   * @deprecated use `setExtension` com um símbolo do módulo; removido em
   * T8/T9. One-shot: qualquer segunda chamada lança.
   */
  setAccess(access: RequestAccess): void {
    const store = this.get()
    if (store.access !== null) {
      throw new Error("access já definido no escopo")
    }
    store.access = access
  }
}

import { AsyncLocalStorage } from "node:async_hooks"

import { Injectable } from "@nestjs/common"

/** Camada que abriu o contexto — carimba `origin` na trilha de auditoria. */
export type RequestOrigin = "http" | "event" | "job" | "backfill"

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

/**
 * Símbolo que carrega o tipo do valor guardado sem existir em runtime: o
 * módulo dono declara `const KEY: ExtensionKey<Perms> = Symbol("…")`.
 */
export type ExtensionKey<T> = symbol & { readonly __extension?: T }

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
  // demais são readonly de fato. `userId`, `access`, `RequestAccess`,
  // `setAccess`, `setUserSession` e `getUserSession` são a superfície
  // transicional lida direto do store por ~20 arquivos: T8/T9 migram esses
  // leitores e removem os campos, e aí actor/extensions viram obrigatórios.
  actor?: Actor | null
  extensions?: Map<symbol, unknown>
  sessionId: string | null
  deviceId: string | null
  userId: string | null
  access: RequestAccess | null
  readonly locale: string
  readonly ip: string | null
  readonly userAgent: string | null
  readonly startedAt: number
}

const als = new AsyncLocalStorage<RequestContextStore>()

function requireStore(): RequestContextStore {
  const store = als.getStore()
  if (!store) {
    throw new Error("RequestContext acessado fora de um escopo de request")
  }
  return store
}

/**
 * Exceção controlada à imutabilidade do store: escrita one-shot null→valor
 * feita pelo middleware do módulo de identidade antes do handler. Qualquer
 * segunda chamada no mesmo escopo lança.
 */
export function setActor(actor: Actor): void {
  const store = requireStore()
  if (store.actor) {
    throw new Error("actor já definido no escopo")
  }
  store.actor = actor
  store.userId = actor.id
}

export function getActor(): Actor | null {
  return als.getStore()?.actor ?? null
}

/**
 * Sacola de extensões do store, endereçada por símbolo do módulo dono: o
 * kernel guarda e devolve sem nunca ler o conteúdo.
 */
export function setExtension<T>(key: ExtensionKey<T>, value: T): void {
  const store = requireStore()
  const extensions = store.extensions ?? new Map<symbol, unknown>()
  store.extensions = extensions
  extensions.set(key, value)
}

export function getExtension<T>(key: ExtensionKey<T>): T | undefined {
  return als.getStore()?.extensions?.get(key) as T | undefined
}

@Injectable()
export class RequestContext {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return als.run(store, fn)
  }

  get(): RequestContextStore {
    return requireStore()
  }

  tryGet(): RequestContextStore | null {
    return als.getStore() ?? null
  }

  setActor(actor: Actor): void {
    setActor(actor)
  }

  getActor(): Actor | null {
    return getActor()
  }

  setExtension<T>(key: ExtensionKey<T>, value: T): void {
    setExtension(key, value)
  }

  getExtension<T>(key: ExtensionKey<T>): T | undefined {
    return getExtension(key)
  }

  setUserSession(
    userId: string,
    sessionId: string,
    deviceId: string | null
  ): void {
    const store = requireStore()
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

  getUserSession(): {
    userId: string | null
    sessionId: string | null
    deviceId: string | null
  } {
    const store = als.getStore()
    return {
      userId: store?.actor?.id ?? null,
      sessionId: store?.sessionId ?? null,
      deviceId: store?.deviceId ?? null,
    }
  }

  setAccess(access: RequestAccess): void {
    const store = requireStore()
    if (store.access !== null) {
      throw new Error("access já definido no escopo")
    }
    store.access = access
  }
}

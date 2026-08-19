import { AsyncLocalStorage } from "node:async_hooks"

import { Injectable } from "@nestjs/common"

/** Camada que abriu o contexto — carimba `origin` na trilha de auditoria. */
export type RequestOrigin = "http" | "event" | "job" | "backfill"

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
  // Única superfície de escrita pós-criação: `setActor` one-shot e
  // `setExtension` por símbolo do módulo dono. Os demais campos são readonly.
  actor: Actor | null
  extensions: Map<symbol, unknown>
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
}

export function getActor(): Actor | null {
  return als.getStore()?.actor ?? null
}

/**
 * Sacola de extensões do store, endereçada por símbolo do módulo dono: o
 * kernel guarda e devolve sem nunca ler o conteúdo.
 */
export function setExtension<T>(key: ExtensionKey<T>, value: T): void {
  requireStore().extensions.set(key, value)
}

export function getExtension<T>(key: ExtensionKey<T>): T | undefined {
  return als.getStore()?.extensions.get(key) as T | undefined
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
}

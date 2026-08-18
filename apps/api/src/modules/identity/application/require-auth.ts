import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import type {
  RequestContext,
  RequestContextStore,
} from "../../../shared/kernel/context/request-context"

/** Store de request com identidade garantida (pós-checagem). */
export type AuthedStore = RequestContextStore & {
  userId: string
  sessionId: string
}

/**
 * Estreita o RequestContext para um store autenticado ou lança `ForbiddenError`.
 * O AuthGuard já barra anônimo; isto é a defesa em profundidade da application
 * layer com semântica única — antes a checagem era copiada em cada use-case com
 * erros divergentes (403/404/no-op).
 */
export function requireAuth(ctx: RequestContext): AuthedStore {
  const store = ctx.get()
  if (!store.userId || !store.sessionId) {
    throw new ForbiddenError()
  }
  return store as AuthedStore
}

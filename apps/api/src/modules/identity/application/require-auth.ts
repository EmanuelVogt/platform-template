import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import { IDENTITY_SESSION } from "./identity-context"

import type { RequestContext } from "../../../shared/kernel/context/request-context"

/** Identidade do request depois da checagem — nunca nula. */
export type AuthedActor = {
  userId: string
  sessionId: string
  deviceId: string | null
}

/**
 * Estreita o RequestContext para um ator autenticado ou lança `ForbiddenError`.
 * O AuthMiddleware + AccessGuard já barram anônimo; isto é a defesa em
 * profundidade da application layer com semântica única — antes a checagem era
 * copiada em cada use-case com erros divergentes (403/404/no-op).
 */
export function requireAuth(ctx: RequestContext): AuthedActor {
  const actor = ctx.getActor()
  const session = ctx.getExtension(IDENTITY_SESSION)
  if (actor === null || session === undefined) {
    throw new ForbiddenError()
  }
  return {
    userId: actor.id,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
  }
}

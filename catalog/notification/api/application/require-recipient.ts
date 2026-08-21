import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import type { RequestContext } from "../../../shared/kernel/context/request-context"

/**
 * Recipient = ator do contexto. O AccessGuard do kernel já barra anônimo; isto
 * é a defesa em profundidade da application layer com semântica única.
 */
export function requireRecipient(ctx: RequestContext): string {
  const actor = ctx.getActor()
  if (!actor) {
    throw new ForbiddenError()
  }
  return actor.id
}

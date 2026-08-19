import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import type { RequestContext } from "../../../shared/kernel/context/request-context"

/**
 * Recipient = userId do contexto. O AuthGuard global já barra anônimo; isto é
 * a defesa em profundidade da application layer com semântica única.
 */
export function requireRecipient(ctx: RequestContext): string {
  const { userId } = ctx.get()
  if (!userId) {
    throw new ForbiddenError()
  }
  return userId
}

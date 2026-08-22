import { RequestContext } from "../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import { IDENTITY_SESSION } from "./identity-context"
import { requireAuth } from "./require-auth"

import type { RequestContextStore } from "../../../shared/kernel/context/request-context"

function storeOf(): RequestContextStore {
  return {
    requestId: "r",
    correlationId: "c",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http" as const,
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

function inRequest<T>(
  published: { actor?: boolean; session?: boolean },
  run: (ctx: RequestContext) => T
): T {
  const ctx = new RequestContext()
  return ctx.run(storeOf(), () => {
    if (published.actor === true) {
      ctx.setActor({ id: "user-1", kind: "user" })
    }
    if (published.session === true) {
      ctx.setExtension(IDENTITY_SESSION, {
        sessionId: "sess-1",
        deviceId: "dev-1",
      })
    }
    return run(ctx)
  })
}

describe("requireAuth", () => {
  it("ator publicado devolve userId, sessionId e deviceId", () => {
    const actor = inRequest({ actor: true, session: true }, (ctx) =>
      requireAuth(ctx)
    )

    expect(actor).toEqual({
      userId: "user-1",
      sessionId: "sess-1",
      deviceId: "dev-1",
    })
  })

  it("sem ator no request lança 403 (sessão de usuário excluído)", () => {
    expect(() =>
      inRequest({ session: true }, (ctx) => requireAuth(ctx))
    ).toThrow(ForbiddenError)
    try {
      inRequest({ session: true }, (ctx) => requireAuth(ctx))
    } catch (error) {
      expect((error as ForbiddenError).status).toBe(403)
    }
  })

  it("sem sessão publicada lança 403", () => {
    expect(() => inRequest({ actor: true }, (ctx) => requireAuth(ctx))).toThrow(
      ForbiddenError
    )
  })
})

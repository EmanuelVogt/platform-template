import type { RequestContextStore } from "../../kernel/context/request-context"

// SPEC_DEVIATION: devolve `RequestContextStore`, não `RequestContext`.
// Reason: design.md § Components 1 escreve `RequestContext` como retorno, mas
// essa classe é o holder do AsyncLocalStorage — não tem estado para preencher
// com um `Partial<RequestContextStore>`. O store é o que os specs montam à mão
// hoje (`problem-details.filter.spec.ts:152`) e o que `ctx.run(store, fn)` come.
export function fakeRequestContext(
  partial: Partial<RequestContextStore> = {}
): RequestContextStore {
  return {
    requestId: "r1",
    correlationId: "c1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: "test",
    startedAt: 0,
    ...partial,
  }
}

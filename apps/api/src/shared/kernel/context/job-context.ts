import { performance } from "node:perf_hooks"

import { ulid } from "ulid"

import type { RequestContextStore } from "./request-context"

export type JobContextInput = {
  /** Correlação persistida pelo job; ausente abre uma correlação nova. */
  readonly correlationId?: string | null
  readonly actorId?: string | null
  readonly tenantId?: string | null
}

/**
 * Contexto sintético de um job: sem request HTTP, ator e correlação vêm do que
 * o job gravou quando foi enfileirado. O dispatcher roda o trabalho dentro
 * deste store para o audit carimbar o ator certo.
 */
export function buildJobContextStore(
  input: JobContextInput = {}
): RequestContextStore {
  const requestId = ulid()
  const actorId = input.actorId ?? null
  const tenantId = input.tenantId ?? null
  return {
    requestId,
    correlationId: input.correlationId ?? requestId,
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId,
    origin: "job",
    actor:
      actorId === null
        ? null
        : {
            id: actorId,
            kind: "job",
            ...(tenantId === null ? {} : { tenantId }),
          },
    extensions: new Map(),
    sessionId: null,
    deviceId: null,
    userId: actorId,
    access: null,
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: performance.now(),
  }
}

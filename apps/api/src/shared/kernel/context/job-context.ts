import { performance } from "node:perf_hooks"

import { ulid } from "ulid"

import type { RequestContextStore } from "./request-context"

export type JobContextInput = {
  /** Correlação persistida pelo job; ausente abre uma correlação nova. */
  readonly correlationId?: string | null
  readonly userId?: string | null
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
  return {
    requestId,
    correlationId: input.correlationId ?? requestId,
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "job",
    userId: input.userId ?? null,
    sessionId: null,
    deviceId: null,
    access: null,
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: performance.now(),
  }
}

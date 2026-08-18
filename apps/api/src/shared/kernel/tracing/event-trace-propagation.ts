import { context, type SpanContext, trace } from "@opentelemetry/api"

/** Serializa o span ativo no formato W3C `traceparent` para gravar no envelope. */
export function currentTraceparent(): string | null {
  const spanContext = trace.getSpanContext(context.active())
  if (!spanContext) {
    return null
  }
  const flags = spanContext.traceFlags.toString(16).padStart(2, "0")
  return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`
}

export type ParsedTraceparent = {
  traceId: string
  spanId: string
  traceFlags: number
}

export function parseTraceparent(
  traceparent: string | null
): ParsedTraceparent | null {
  if (!traceparent) {
    return null
  }
  const parts = traceparent.split("-")
  if (parts.length !== 4) {
    return null
  }
  const [, traceId, spanId, flags] = parts
  if (!traceId || !spanId || !flags) {
    return null
  }
  return { traceId, spanId, traceFlags: Number.parseInt(flags, 16) }
}

/** Monta um SpanContext remoto a partir do traceparent (para link cross-process). */
export function remoteSpanContextFromTraceparent(
  traceparent: string | null
): SpanContext | null {
  const parsed = parseTraceparent(traceparent)
  if (!parsed) {
    return null
  }
  return {
    traceId: parsed.traceId,
    spanId: parsed.spanId,
    traceFlags: parsed.traceFlags,
    isRemote: true,
  }
}

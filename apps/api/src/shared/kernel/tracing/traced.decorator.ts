import { SpanStatusCode, trace } from "@opentelemetry/api"

export type TracedOptions = {
  name?: string
}

type AsyncMethod = (...args: unknown[]) => Promise<unknown>

const tracer = trace.getTracer("api")

/** Abre um span filho do span ativo ao redor do método (use case / handler). */
export function Traced(opts: TracedOptions = {}): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor): void => {
    const original = descriptor.value as AsyncMethod
    const spanName = opts.name ?? String(propertyKey)
    descriptor.value = function (
      this: unknown,
      ...args: unknown[]
    ): Promise<unknown> {
      return tracer.startActiveSpan(spanName, async (span) => {
        try {
          return (await original.apply(this, args))
        } catch (err) {
          span.recordException(err as Error)
          span.setStatus({ code: SpanStatusCode.ERROR })
          throw err
        } finally {
          span.end()
        }
      })
    }
  }
}

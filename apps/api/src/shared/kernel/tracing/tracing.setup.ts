import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { NodeSDK } from "@opentelemetry/sdk-node"
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions"

import { env } from "../../config/env"

import type {
  logs,
  metrics as sdkMetrics,
  tracing,
} from "@opentelemetry/sdk-node"

export type SignalPipelines = {
  traceExporter?: tracing.SpanExporter
  spanProcessors?: tracing.SpanProcessor[]
  logRecordProcessors?: logs.LogRecordProcessor[]
  metricReaders?: sdkMetrics.IMetricReader[]
}

let sdk: NodeSDK | null = null

/**
 * Sem endpoint, os três sinais recebem lista **vazia**, nunca `undefined`: o
 * NodeSDK lê ausência como "use o default", que é OTLP em `localhost:4318`.
 * Medido em 17/08: 20 POSTs recusados em 10 s, e o flush do shutdown rejeitando
 * fazia o Nest encerrar com exit 1 a cada deploy. As instrumentations seguem
 * ativas nos dois casos, então o traceId continua alimentando os logs.
 */
export function signalPipelines(): SignalPipelines {
  if (!env().OTEL_EXPORTER_OTLP_ENDPOINT) {
    return { spanProcessors: [], logRecordProcessors: [], metricReaders: [] }
  }
  return {
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    ],
  }
}

/** Inicia o SDK OTel. DEVE rodar antes de `NestFactory.create`. */
export function startTracing(): void {
  if (sdk) {
    return
  }
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env().OTEL_SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: env().SERVICE_VERSION,
    }),
    ...signalPipelines(),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  })
  sdk.start()
}

export async function stopTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = null
  }
}

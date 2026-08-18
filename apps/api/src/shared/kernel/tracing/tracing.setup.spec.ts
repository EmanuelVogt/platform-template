import { signalPipelines } from "./tracing.setup"

jest.mock("../../config/env", () => ({
  env: jest.fn(),
}))

const { env } = jest.requireMock<{ env: jest.Mock }>("../../config/env")

function withEndpoint(endpoint: string): void {
  env.mockReturnValue({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })
}

describe("signalPipelines", () => {
  it("sem endpoint entrega lista vazia nos três sinais, nunca undefined", () => {
    withEndpoint("")
    const pipelines = signalPipelines()

    // `undefined` faria o NodeSDK cair no default OTLP de localhost:4318, cujo
    // flush recusado derruba o shutdown com exit 1.
    expect(pipelines.spanProcessors).toEqual([])
    expect(pipelines.logRecordProcessors).toEqual([])
    expect(pipelines.metricReaders).toEqual([])
    expect(pipelines.traceExporter).toBeUndefined()
  })

  it("com endpoint liga exportação de trace e de métrica", () => {
    withEndpoint("http://collector:4318")
    const pipelines = signalPipelines()

    expect(pipelines.traceExporter).toBeDefined()
    expect(pipelines.metricReaders).toHaveLength(1)
    expect(pipelines.spanProcessors).toBeUndefined()
  })
})

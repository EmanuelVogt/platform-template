export { client, configureClient, instance } from "./client.js"
export type {
  ConfigureClientOptions,
  RequestConfig,
  ResponseConfig,
  ResponseErrorConfig,
} from "./client.js"

// Re-export dos artefatos gerados pelo Kubb (hooks TanStack Query + schemas Zod).
// NÃO editar generated/ à mão (front-arch.md regra 10).
export * from "../generated/index.js"

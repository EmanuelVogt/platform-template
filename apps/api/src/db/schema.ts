// Agrega TODAS as tabelas do backend (kernel, entradas do catálogo e produto)
// num único módulo de schema — é o `schema` do drizzle.config.ts e o que o
// AppModule entrega ao `DatabaseModule.forRoot` (o kernel não o importa: RULE
// A). Tabela nova exige o export aqui, senão o drizzle-kit não a enxerga
// (trava: schema-completeness.spec.ts). Imports relativos de propósito:
// drizzle-kit carrega este arquivo sem resolver o alias "@/".
export { idempotencyKeys } from "../shared/kernel/idempotency/idempotency.table"
export { outbox, outboxDead } from "../shared/kernel/outbox/outbox.table"
export { processedEvents } from "../shared/kernel/outbox/processed-events.table"
export * from "./platform-schema"

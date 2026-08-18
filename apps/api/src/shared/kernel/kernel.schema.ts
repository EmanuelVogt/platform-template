import { pgSchema } from "drizzle-orm/pg-core"

/**
 * Schema Postgres do kernel. Concentra outbox, processed_events e
 * idempotency_keys — infra transversal sem dono de módulo de negócio.
 */
export const kernelSchema = pgSchema("_kernel")

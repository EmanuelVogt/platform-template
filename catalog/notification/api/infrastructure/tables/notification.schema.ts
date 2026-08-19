import { pgSchema } from "drizzle-orm/pg-core"

/** Schema lógico do módulo de notificações. Espelha `pgSchema('notification')`. */
export const notificationSchema = pgSchema("notification")

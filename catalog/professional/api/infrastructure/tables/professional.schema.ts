import { pgSchema } from "drizzle-orm/pg-core"

/** Schema lógico da entrada profissional. Espelha `pgSchema('professional')`. */
export const professionalSchema = pgSchema("professional")

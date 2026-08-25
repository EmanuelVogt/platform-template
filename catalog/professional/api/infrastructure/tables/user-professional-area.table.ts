import { primaryKey, text, timestamp } from "drizzle-orm/pg-core"

import { users } from "../../../identity/infrastructure/tables/user.table"

import { professionalSchema } from "./professional.schema"

/**
 * Áreas de atuação do usuário Profissional. `area_id` referencia `service.areas`
 * por id, SEM FK cross-schema (padrão de referência cross-module do monorepo) — a
 * existência/atividade é validada no use-case via ProfessionalScopePort. Ver ADR 0032.
 */
export const userProfessionalAreas = professionalSchema.table(
  "user_professional_areas",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaId: text("area_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.areaId] })]
)

export type UserProfessionalAreaRow = typeof userProfessionalAreas.$inferSelect

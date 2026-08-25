import { primaryKey, text, timestamp } from "drizzle-orm/pg-core"

import { users } from "../../../identity/infrastructure/tables/user.table"

import { professionalSchema } from "./professional.schema"

/**
 * Áreas em que o usuário do perfil Agendamentos pode agendar. Relação
 * independente de `user_professional_areas` (semântica distinta — lá é atuação
 * do Profissional). `area_id` referencia `service.areas` por id, SEM FK
 * cross-schema (padrão de referência cross-module do monorepo) — a
 * existência/atividade é validada no use-case via ProfessionalScopePort. Ver ADR 0032.
 */
export const userSchedulingAreas = professionalSchema.table(
  "user_scheduling_areas",
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

export type UserSchedulingAreaRow = typeof userSchedulingAreas.$inferSelect

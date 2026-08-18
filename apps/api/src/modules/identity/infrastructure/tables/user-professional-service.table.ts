import { boolean, primaryKey, text, timestamp } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"
import { users } from "./user.table"

/**
 * Serviços de atuação do usuário Profissional (subconjunto dos serviços das áreas
 * selecionadas). `service_id` referencia `service.services` por id, SEM FK
 * cross-schema — pertencimento à área e atividade são validados no use-case via
 * ProfessionalScopePort. Ver ADR 0032.
 */
export const userProfessionalServices = identitySchema.table(
  "user_professional_services",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceId: text("service_id").notNull(),
    // Profissional padrão do serviço (espelho do isDefault da activity) — vários possíveis.
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serviceId] })]
)

export type UserProfessionalServiceRow =
  typeof userProfessionalServices.$inferSelect

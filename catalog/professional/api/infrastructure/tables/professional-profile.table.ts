import { boolean, date, text, timestamp } from "drizzle-orm/pg-core"

import { users } from "../../../identity/infrastructure/tables/user.table"

import { professionalSchema } from "./professional.schema"

/**
 * Perfil profissional do usuário, 1:1 com `identity.users` — o corte do agregado
 * (AD-035) tira `serves_clients` e `birth_date` da tabela de usuários e os traz
 * para cá. A linha nasce quando o usuário ganha o recorte; ausência = usuário
 * sem perfil profissional.
 *
 * `user_id` é PK e FK com ON DELETE CASCADE: apagar o usuário apaga o perfil.
 */
export const professionalProfile = professionalSchema.table(
  "professional_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // Atende cliente: entra nos seletores, nos mapas e na escala. NÃO deriva do
    // access_profile — agendista e recepção também atendem (ADR 0082).
    servesClients: boolean("serves_clients").notNull().default(false),
    birthDate: date("birth_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
)

export type ProfessionalProfileRow = typeof professionalProfile.$inferSelect
export type ProfessionalProfileInsert = typeof professionalProfile.$inferInsert

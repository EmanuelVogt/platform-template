import { sql } from "drizzle-orm"
import { check, integer, smallint, text, timestamp } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"

// Config global (sem user_id): template padrão de horário dos profissionais.
// type é text + CHECK, sem pgEnum (gotcha enum-em-transação, padrão reservation).
export const professionalDefaultHours = identitySchema.table(
  "professional_default_hours",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    dayOfWeek: smallint("day_of_week").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "professional_default_hours_type_valid",
      sql`${t.type} in ('available', 'lunch', 'break', 'meeting', 'administrative')`
    ),
    check(
      "professional_default_hours_day_range",
      sql`${t.dayOfWeek} between 0 and 6`
    ),
    check(
      "professional_default_hours_start_range",
      sql`${t.startMinute} between 0 and 1439`
    ),
    check(
      "professional_default_hours_end_range",
      sql`${t.endMinute} > ${t.startMinute} and ${t.endMinute} <= 1440`
    ),
  ]
)

export type ProfessionalDefaultHoursRow =
  typeof professionalDefaultHours.$inferSelect

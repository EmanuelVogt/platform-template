import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"
import { users } from "./user.table"

// Linha só nasce quando a marcação muda: ausência = profissional não-extra.
export const userProfessionalScheduleConfigs = identitySchema.table(
  "user_professional_schedule_configs",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    isExtra: boolean("is_extra").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
)

// type é text + CHECK, sem pgEnum (gotcha enum-em-transação, padrão reservation).
export const userProfessionalScheduleConfigSlots = identitySchema.table(
  "user_professional_schedule_config_slots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    dayOfWeek: smallint("day_of_week").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("user_professional_schedule_config_slots_user_idx").on(t.userId),
    check(
      "user_professional_schedule_config_slots_type_valid",
      sql`${t.type} in ('available', 'lunch', 'break', 'meeting', 'administrative')`
    ),
    check(
      "user_professional_schedule_config_slots_day_range",
      sql`${t.dayOfWeek} between 0 and 6`
    ),
    check(
      "user_professional_schedule_config_slots_start_range",
      sql`${t.startMinute} between 0 and 1439`
    ),
    check(
      "user_professional_schedule_config_slots_end_range",
      sql`${t.endMinute} > ${t.startMinute} and ${t.endMinute} <= 1440`
    ),
  ]
)

export const userProfessionalScheduleConfigBlocks = identitySchema.table(
  "user_professional_schedule_config_blocks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    reason: text("reason"),
    // Bitmask 1-127, bit 0 = segunda .. bit 6 = domingo (convenção do
    // sistema, não é o getDay do JS). 127 = todo dia do período.
    weekdays: smallint("weekdays").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("user_professional_schedule_config_blocks_user_idx").on(t.userId),
    check(
      "user_professional_schedule_config_blocks_date_range",
      sql`${t.endDate} >= ${t.startDate}`
    ),
    check(
      "user_professional_schedule_config_blocks_minute_pair",
      sql`(${t.startMinute} is null) = (${t.endMinute} is null)`
    ),
    check(
      "user_professional_schedule_config_blocks_minute_range",
      sql`${t.startMinute} is null or (${t.startMinute} between 0 and 1439 and ${t.endMinute} > ${t.startMinute} and ${t.endMinute} <= 1440)`
    ),
    check(
      "user_professional_schedule_config_blocks_weekdays_range",
      sql`${t.weekdays} between 1 and 127`
    ),
  ]
)

export type UserProfessionalScheduleConfigRow =
  typeof userProfessionalScheduleConfigs.$inferSelect
export type UserProfessionalScheduleConfigSlotRow =
  typeof userProfessionalScheduleConfigSlots.$inferSelect
export type UserProfessionalScheduleConfigBlockRow =
  typeof userProfessionalScheduleConfigBlocks.$inferSelect

import { primaryKey, text, timestamp } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"
import { users } from "./user.table"

export const userPermissions = identitySchema.table(
  "user_permissions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Chave do catálogo (validada na borda via z.enum; o banco não conhece o catálogo).
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permission] })]
)

export type UserPermissionRow = typeof userPermissions.$inferSelect

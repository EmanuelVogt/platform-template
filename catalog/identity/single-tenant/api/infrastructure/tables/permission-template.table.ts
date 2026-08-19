import { primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"

export const permissionTemplates = identitySchema.table(
  "permission_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("permission_templates_name_unique").on(t.name)]
)

export const permissionTemplatePermissions = identitySchema.table(
  "permission_template_permissions",
  {
    templateId: text("template_id")
      .notNull()
      .references(() => permissionTemplates.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.permission] })]
)

export type PermissionTemplateRow = typeof permissionTemplates.$inferSelect

import { text, timestamp } from "drizzle-orm/pg-core"

import { attachmentSchema } from "./attachment.schema"
import { attachments } from "./attachment.table"

export const attachmentVisibility = attachmentSchema.enum(
  "attachment_visibility",
  ["public", "authenticated", "restricted"]
)

export const attachmentAcls = attachmentSchema.table("attachment_acls", {
  attachmentId: text("attachment_id")
    .primaryKey()
    .references(() => attachments.id, { onDelete: "cascade" }),
  visibility: attachmentVisibility("visibility").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type AttachmentAclRow = typeof attachmentAcls.$inferSelect

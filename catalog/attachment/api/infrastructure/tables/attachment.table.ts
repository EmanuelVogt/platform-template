import { integer, text, timestamp } from "drizzle-orm/pg-core"

import { attachmentSchema } from "./attachment.schema"

export const attachmentStatus = attachmentSchema.enum("attachment_status", [
  "pending",
  "ready",
  "deleted",
])

export const attachments = attachmentSchema.table("attachments", {
  id: text("id").primaryKey(),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksum: text("checksum"),
  originalFilename: text("original_filename"),
  profile: text("profile").notNull().default("legacy"),
  // id lógico de outro schema (identity.users) — sem FK física, mantém desacoplado.
  ownerUserId: text("owner_user_id"),
  status: attachmentStatus("status").notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type AttachmentRow = typeof attachments.$inferSelect
export type AttachmentInsert = typeof attachments.$inferInsert

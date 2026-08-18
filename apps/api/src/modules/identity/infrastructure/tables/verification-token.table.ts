import { index, text, timestamp } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"
import { users } from "./user.table"

/** Espelha `TokenType` do domínio: 'email_verify' | 'password_reset' | 'access_link' | 'email_change'. */
export const verificationTokenType = identitySchema.enum(
  "verification_token_type",
  ["email_verify", "password_reset", "access_link", "email_change"]
)

export const verificationTokens = identitySchema.table(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: verificationTokenType("type").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("verification_tokens_token_hash_idx").on(t.tokenHash),
    index("verification_tokens_user_type_created_idx").on(
      t.userId,
      t.type,
      t.createdAt
    ),
  ]
)

export type VerificationTokenRow = typeof verificationTokens.$inferSelect
export type VerificationTokenInsert = typeof verificationTokens.$inferInsert

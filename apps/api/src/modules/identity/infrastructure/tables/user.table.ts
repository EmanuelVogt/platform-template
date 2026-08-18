import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { ACCESS_PROFILES } from "../../../../shared/kernel/access/permission.types"

import { identitySchema } from "./identity.schema"

/** Ciclo de vida da conta: 'pending' (criado, sem senha) → 'active' (configurou senha). */
export const userStatus = identitySchema.enum("user_status", ["pending", "active"])

export const accessProfile = identitySchema.enum("access_profile", ACCESS_PROFILES)

export const users = identitySchema.table(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    // E-mail novo aguardando confirmação na troca self-service; null = sem troca pendente.
    pendingEmail: text("pending_email"),
    accessProfile: accessProfile("access_profile").notNull().default("admin"),
    // Atende cliente: entra nos seletores, nos mapas e na escala. NÃO deriva do
    // access_profile — agendista e recepção também atendem (ADR 0082).
    servesClients: boolean("serves_clients").notNull().default(false),
    passwordHash: text("password_hash"),
    status: userStatus("status").notNull().default("active"),
    pepperVersion: integer("pepper_version").notNull().default(1),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastResetRequestedAt: timestamp("last_reset_requested_at", {
      withTimezone: true,
    }),
    lastVerificationRequestedAt: timestamp("last_verification_requested_at", {
      withTimezone: true,
    }),
    lastEmailChangeRequestedAt: timestamp("last_email_change_requested_at", {
      withTimezone: true,
    }),
    // ISO 'YYYY-MM-DD'; preenchida na ativação. Nullable: master/seed nunca passam pela tela.
    birthDate: date("birth_date"),
    // Referência lógica a attachment.attachments (sem FK cross-schema). Null = sem avatar.
    avatarAttachmentId: text("avatar_attachment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // userId do admin que criou a conta (null = seed/master). Alimenta o
    // password_set do notifications — quem criou é notificado na ativação.
    createdByUserId: text("created_by_user_id"),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_single_master_idx")
      .on(t.accessProfile)
      .where(sql`${t.accessProfile} = 'master'`),
  ]
)

export type UserRow = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert

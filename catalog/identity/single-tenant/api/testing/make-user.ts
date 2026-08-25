import { User } from "../domain/entities/user.entity"

import type { UserProps } from "../domain/entities/user.entity"

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z")

/** Agregado de usuário para spec: só o que o teste muda entra em `over`. */
export function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    emailVerified: true,
    pendingEmail: null,
    accessProfile: "admin",
    passwordHash: "hash",
    pepperVersion: 1,
    status: "active",
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: null,
    avatarAttachmentId: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    deletedAt: null,
    createdByUserId: null,
    ...over,
  })
}

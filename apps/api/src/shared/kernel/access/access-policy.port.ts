import type { Actor } from "../context/request-context"

export const ACCESS_POLICY = Symbol("ACCESS_POLICY")

// Chave larga: o kernel não conhece catálogo de permissão. O registry tipado
// mora na entrada dona do catálogo e só vale dentro dela.
export type PermissionKey = string

export type AccessRequirement =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; key: PermissionKey }
  | { kind: "anyPermission"; keys: readonly PermissionKey[] }

export interface AccessPolicy {
  can(
    actor: Actor | null,
    requirement: AccessRequirement
  ): Promise<boolean> | boolean
}

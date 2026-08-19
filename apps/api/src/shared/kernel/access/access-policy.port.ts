import type { Actor } from "../context/request-context"

export const ACCESS_POLICY = Symbol("ACCESS_POLICY")

// SPEC_DEVIATION: design § 2.1 troca `PermissionKey` do kernel por `string`.
// Reason: o registry tipado em access/permission.types.ts ainda é load-bearing
// (augmentation em identity + audit); a remoção é da T22. Até lá o kernel usa
// esta chave larga e o catálogo tipado segue valendo no módulo dono.
export type PermissionKey = string

export type AccessRequirement =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; key: PermissionKey }

export interface AccessPolicy {
  can(
    actor: Actor | null,
    requirement: AccessRequirement
  ): Promise<boolean> | boolean
}

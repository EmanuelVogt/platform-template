import { requiresPermissionFloor } from "../domain/access/permission.types"
import {
  InvalidPermissionSetError,
  PermissionGrantNotAllowedError,
} from "../domain/errors"
import { moduleOf, requiresOf } from "../domain/permissions/permission-catalog"

import type { IdentityAccess } from "./identity-context"
import type {
  AccessProfile,
  AssignableAccessProfile,
} from "../domain/access/permission.types"
import type { PermissionKey } from "../domain/permissions/permission-catalog"

export function assertValidPermissionSet(
  permissions: readonly PermissionKey[]
): void {
  const set = new Set(permissions)
  const missing = new Set<PermissionKey>()
  for (const key of permissions) {
    for (const required of requiresOf(key)) {
      if (!set.has(required)) missing.add(required)
    }
  }
  if (missing.size > 0) {
    throw new InvalidPermissionSetError(
      `Permissões pré-requisito ausentes: ${[...missing].join(", ")}`
    )
  }
}

export function assertProfileFloor(
  profile: AccessProfile,
  permissions: readonly PermissionKey[]
): void {
  if (!requiresPermissionFloor(profile)) return
  if (permissions.some((key) => moduleOf(key) === profile)) return
  throw new InvalidPermissionSetError(
    `O perfil de acesso exige ao menos uma permissão do módulo "${profile}".`
  )
}

export type ResolvedUserAccess = {
  permissions: PermissionKey[]
}

export type GrantContext = {
  actor: IdentityAccess
  current: readonly PermissionKey[]
}

/**
 * Toda EDIÇÃO do conjunto do alvo — conceder e revogar — precisa estar dentro
 * do que o ator possui: a diferença simétrica entre o conjunto atual e o
 * pedido é o delta, e cada chave do delta tem de ser do ator. Só olhar o
 * acréscimo deixava um admin apagar permissão que ele próprio não tem.
 * Chave que o alvo já tinha e permanece não é edição, então não entra no
 * delta; master é isento.
 */
export function assertCanGrant(
  grant: GrantContext,
  requested: readonly PermissionKey[]
): void {
  if (grant.actor.isMaster) return
  const current = new Set(grant.current)
  const next = new Set(requested)
  const delta = [
    ...[...next].filter((key) => !current.has(key)),
    ...[...current].filter((key) => !next.has(key)),
  ]
  if (delta.some((key) => !grant.actor.permissions.has(key))) {
    throw new PermissionGrantNotAllowedError()
  }
}

export function resolveUserAccess(
  input: {
    accessProfile: AssignableAccessProfile
    permissions: readonly PermissionKey[]
  },
  grant: GrantContext
): ResolvedUserAccess {
  assertCanGrant(grant, input.permissions)
  assertValidPermissionSet(input.permissions)
  assertProfileFloor(input.accessProfile, input.permissions)

  return { permissions: [...input.permissions] }
}

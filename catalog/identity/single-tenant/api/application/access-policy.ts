import { requiresPermissionFloor } from "../domain/access/permission.types"
import {
  InvalidPermissionSetError,
  InvalidProfessionalScopeError,
  InvalidSchedulingAreasError,
  PermissionGrantNotAllowedError,
} from "../domain/errors"
import { moduleOf, requiresOf } from "../domain/permissions/permission-catalog"

import type { IdentityAccess } from "./identity-context"
import type {
  AccessProfile,
  AssignableAccessProfile,
} from "../domain/access/permission.types"
import type { PermissionKey } from "../domain/permissions/permission-catalog"
import type { ProfessionalScope } from "../domain/ports/professional-scope.port"

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
  areaIds: string[]
  serviceIds: string[]
  schedulingAreaIds: string[]
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

export async function resolveUserAccess(
  input: {
    accessProfile: AssignableAccessProfile
    servesClients: boolean
    permissions: readonly PermissionKey[]
    areaIds: readonly string[]
    serviceIds: readonly string[]
    schedulingAreaIds: readonly string[]
  },
  scope: ProfessionalScope,
  grant: GrantContext
): Promise<ResolvedUserAccess> {
  assertCanGrant(grant, input.permissions)
  assertValidPermissionSet(input.permissions)
  assertProfileFloor(input.accessProfile, input.permissions)

  // Duas perguntas independentes (ADR 0082): atuação segue a marcação de
  // atendimento; agendamento segue o perfil. Uma nunca zera a outra.
  const attendance = await resolveAttendanceScope(input, scope)
  const schedulingAreaIds = await resolveSchedulingAreas(input, scope)

  return {
    permissions: [...input.permissions],
    ...attendance,
    schedulingAreaIds,
  }
}

async function resolveAttendanceScope(
  input: {
    servesClients: boolean
    areaIds: readonly string[]
    serviceIds: readonly string[]
  },
  scope: ProfessionalScope
): Promise<{ areaIds: string[]; serviceIds: string[] }> {
  if (!input.servesClients) return { areaIds: [], serviceIds: [] }
  if (input.areaIds.length === 0) {
    throw new InvalidProfessionalScopeError(
      "Selecione ao menos uma área de atuação."
    )
  }
  await scope.assertValid(input.areaIds, input.serviceIds)
  return { areaIds: [...input.areaIds], serviceIds: [...input.serviceIds] }
}

async function resolveSchedulingAreas(
  input: { schedulingAreaIds: readonly string[] },
  scope: ProfessionalScope
): Promise<string[]> {
  if (input.schedulingAreaIds.length === 0) return []
  // Reusa a validação estrutural do port (existência/atividade da área);
  // o erro sai traduzido com o type da relação de agendamento, não o do
  // escopo de atuação — são vínculos independentes.
  try {
    await scope.assertValid(input.schedulingAreaIds, [])
  } catch (error) {
    if (error instanceof InvalidProfessionalScopeError) {
      throw new InvalidSchedulingAreasError(error.message)
    }
    throw error
  }
  return [...input.schedulingAreaIds]
}

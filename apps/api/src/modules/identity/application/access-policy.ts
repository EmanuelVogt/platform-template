import {
  InvalidPermissionSetError,
  InvalidProfessionalScopeError,
  InvalidSchedulingAreasError,
  PermissionGrantNotAllowedError,
} from "../domain/errors"
import { moduleOf, requiresOf } from "../domain/permissions/permission-catalog"

import type {
  AccessProfile,
  AssignableAccessProfile,
} from "../../../shared/kernel/access/permission.types"
import type { RequestAccess } from "../../../shared/kernel/context/request-context"
import type { PermissionKey } from "../domain/permissions/permission-catalog"
import type { ProfessionalScope } from "../domain/ports/professional-scope.port"

export function assertValidPermissionSet(
  permissions: readonly PermissionKey[],
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
      `Permissões pré-requisito ausentes: ${[...missing].join(", ")}`,
    )
  }
}

export function assertProfileFloor(
  profile: AccessProfile,
  permissions: readonly PermissionKey[],
): void {
  if (profile === "master" || profile === "professional") return
  if (permissions.some((key) => moduleOf(key) === profile)) return
  throw new InvalidPermissionSetError(
    `O perfil de acesso exige ao menos uma permissão do módulo "${profile}".`,
  )
}

export type ResolvedUserAccess = {
  permissions: PermissionKey[]
  areaIds: string[]
  serviceIds: string[]
  schedulingAreaIds: string[]
}

export type GrantContext = {
  actor: RequestAccess
  current: readonly PermissionKey[]
}

export function assertCanGrant(
  grant: GrantContext,
  requested: readonly PermissionKey[],
): void {
  if (grant.actor.isMaster) return
  const current = new Set(grant.current)
  const added = requested.filter((key) => !current.has(key))
  if (added.some((key) => !grant.actor.permissions.has(key))) {
    throw new PermissionGrantNotAllowedError()
  }
}

export async function resolveUserAccess(
  input: {
    accessProfile: AssignableAccessProfile
    attendsGuests: boolean
    permissions: readonly PermissionKey[]
    areaIds: readonly string[]
    serviceIds: readonly string[]
    schedulingAreaIds: readonly string[]
  },
  scope: ProfessionalScope,
  grant: GrantContext,
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
    attendsGuests: boolean
    areaIds: readonly string[]
    serviceIds: readonly string[]
  },
  scope: ProfessionalScope,
): Promise<{ areaIds: string[]; serviceIds: string[] }> {
  if (!input.attendsGuests) return { areaIds: [], serviceIds: [] }
  if (input.areaIds.length === 0) {
    throw new InvalidProfessionalScopeError(
      "Selecione ao menos uma área de atuação.",
    )
  }
  await scope.assertValid(input.areaIds, input.serviceIds)
  return { areaIds: [...input.areaIds], serviceIds: [...input.serviceIds] }
}

async function resolveSchedulingAreas(
  input: { schedulingAreaIds: readonly string[] },
  scope: ProfessionalScope,
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

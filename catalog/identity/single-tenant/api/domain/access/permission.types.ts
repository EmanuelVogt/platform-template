import { BASE_ACCESS_PROFILES } from "./access-profile.types"
import { defineAccessProfiles } from "./define-access-profiles"
import { PRODUCT_ACCESS_PROFILES } from "./product-access-profiles"

/** Perfil de acesso é enum do banco (`identity.access_profile`): o que o
 *  produto acrescenta ao slot só persiste depois da migration `ADD VALUE`. */
const accessProfiles = defineAccessProfiles([
  ...BASE_ACCESS_PROFILES,
  ...PRODUCT_ACCESS_PROFILES,
] as const)

export const {
  ACCESS_PROFILES,
  ASSIGNABLE_ACCESS_PROFILES,
  PROFILE_DEFS,
  isAccessProfile,
  profileOf,
  requiresPermissionFloor,
} = accessProfiles

export type AccessProfile = (typeof ACCESS_PROFILES)[number]
export type AssignableAccessProfile =
  (typeof ASSIGNABLE_ACCESS_PROFILES)[number]

export type PermissionDef = {
  readonly key: string
  readonly label: string
  readonly requires: readonly string[]
}

export type FeatureDef = {
  readonly key: string
  readonly label: string
  readonly permissions: readonly PermissionDef[]
}

export type ModuleDef = {
  readonly key: string
  readonly label: string
  readonly features: readonly FeatureDef[]
}

export type OwningFeature = { key: string; label: string }

/**
 * Slot do kernel: cada módulo dono de catálogo acrescenta aqui, por `declare
 * module`, uma propriedade com a união das chaves que registra. Sem nenhum
 * módulo dono `PermissionKey` é `never` — nenhuma rota compila.
 */
export interface PermissionKeyRegistry {
  readonly base?: never
}

export type PermissionKey = NonNullable<
  PermissionKeyRegistry[keyof PermissionKeyRegistry]
>

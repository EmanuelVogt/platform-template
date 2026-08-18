/** Perfil de acesso é enum do banco (`identity.access_profile`): acrescentar
 *  valor exige migration, então a lista não deriva do catálogo. */
export const ACCESS_PROFILES = ["master", "admin", "professional"] as const
export type AccessProfile = (typeof ACCESS_PROFILES)[number]

export const ASSIGNABLE_ACCESS_PROFILES = ["admin", "professional"] as const
export type AssignableAccessProfile = (typeof ASSIGNABLE_ACCESS_PROFILES)[number]

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

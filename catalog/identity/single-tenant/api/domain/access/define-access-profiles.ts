import type { AccessProfileDef } from "./access-profile.types"

type ProfileKey<D extends readonly AccessProfileDef[]> = D[number]["key"]

type AssignableProfileKey<D extends readonly AccessProfileDef[]> = Extract<
  D[number],
  { assignable: true }
>["key"]

export type AccessProfileRegistry<K extends string, A extends string> = {
  readonly ACCESS_PROFILES: [K, ...K[]]
  readonly ASSIGNABLE_ACCESS_PROFILES: [A, ...A[]]
  readonly PROFILE_DEFS: readonly AccessProfileDef[]
  readonly profileOf: (key: K) => AccessProfileDef
  readonly requiresPermissionFloor: (key: K) => boolean
  readonly isAccessProfile: (value: string) => value is K
}

export function defineAccessProfiles<D extends readonly AccessProfileDef[]>(
  defs: D
): AccessProfileRegistry<ProfileKey<D>, AssignableProfileKey<D>> {
  type Key = ProfileKey<D>
  type Assignable = AssignableProfileKey<D>

  const byKey = new Map<string, AccessProfileDef>()
  for (const def of defs) {
    if (byKey.has(def.key))
      throw new Error(`Perfil de acesso duplicado: ${def.key}`)
    byKey.set(def.key, def)
  }

  const profileOf = (key: Key): AccessProfileDef => {
    const def = byKey.get(key)
    if (!def) throw new Error(`Perfil de acesso fora do registro: ${key}`)
    return def
  }

  return {
    ACCESS_PROFILES: defs.map((def) => def.key) as [Key, ...Key[]],
    ASSIGNABLE_ACCESS_PROFILES: defs
      .filter((def) => def.assignable)
      .map((def) => def.key) as [Assignable, ...Assignable[]],
    PROFILE_DEFS: defs,
    profileOf,
    requiresPermissionFloor: (key) => profileOf(key).permissionFloor,
    isAccessProfile: (value: string): value is Key => byKey.has(value),
  }
}

import type { ModuleDef, OwningFeature } from "./permission.types"

type CatalogKey<M extends readonly ModuleDef[]> =
  M[number]["features"][number]["permissions"][number]["key"]

type CatalogEntry = {
  module: string
  requires: readonly string[]
  feature: OwningFeature
}

export type PermissionCatalog<K extends string> = {
  readonly PERMISSION_KEYS: [K, ...K[]]
  readonly requiresOf: (key: K) => readonly K[]
  readonly moduleOf: (key: K) => string
  readonly featureOf: (key: K) => OwningFeature
  readonly isPermissionKey: (value: string) => value is K
}

export function definePermissionCatalog<M extends readonly ModuleDef[]>(
  modules: M,
): PermissionCatalog<CatalogKey<M>> {
  type Key = CatalogKey<M>

  const byKey = new Map<string, CatalogEntry>(
    modules.flatMap((m) =>
      m.features.flatMap((f) =>
        f.permissions.map(
          (p) =>
            [
              p.key,
              {
                module: m.key,
                requires: p.requires,
                feature: { key: f.key, label: f.label },
              },
            ] as [string, CatalogEntry],
        ),
      ),
    ),
  )

  const allKeys = modules.flatMap((m) =>
    m.features.flatMap((f) => f.permissions.map((p) => p.key)),
  ) as Key[]

  return {
    PERMISSION_KEYS: allKeys as [Key, ...Key[]],
    requiresOf: (key) => byKey.get(key)?.requires ?? [],
    moduleOf: (key) => {
      const entry = byKey.get(key)
      if (!entry) throw new Error(`Chave de permissão fora do catálogo: ${key}`)
      return entry.module
    },
    featureOf: (key) => {
      const entry = byKey.get(key)
      if (!entry) throw new Error(`Chave de permissão fora do catálogo: ${key}`)
      return entry.feature
    },
    isPermissionKey: (value: string): value is Key => byKey.has(value),
  }
}

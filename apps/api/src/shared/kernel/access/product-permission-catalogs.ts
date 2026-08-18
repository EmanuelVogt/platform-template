import type { ModuleDef } from "./permission.types"

/**
 * Slot de produto para o catálogo de permissões. O base-set registra só o
 * `admin`; cada módulo de negócio acrescenta aqui o próprio `ModuleDef` (com
 * `as const`, senão as chaves viram `string` e `PermissionKey` deixa de tipar).
 * O `declare module` de `PermissionKeyRegistry` continua sendo quem publica as
 * chaves para o tipo — este array é o lado de runtime.
 */
export const PRODUCT_PERMISSION_CATALOGS = [] as const satisfies readonly ModuleDef[]

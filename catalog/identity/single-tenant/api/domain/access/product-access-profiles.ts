import type { AccessProfileDef } from "./access-profile.types"

/**
 * Slot de produto para os perfis de acesso. O base-set registra `master`,
 * `admin` e `professional`; cada produto acrescenta aqui o próprio
 * `AccessProfileDef` (com `as const`, senão as chaves viram `string` e
 * `AccessProfile` deixa de tipar). O perfil só é persistível depois de uma
 * migration do produto com `ALTER TYPE identity.access_profile ADD VALUE`.
 */
export const PRODUCT_ACCESS_PROFILES =
  [] as const satisfies readonly AccessProfileDef[]

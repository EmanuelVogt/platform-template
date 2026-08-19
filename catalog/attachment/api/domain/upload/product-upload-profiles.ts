import type { UploadProfileDef } from "./upload-profile.types"

/**
 * Slot de produto para os perfis de upload. O base-set registra `avatar`,
 * `access-link-avatar`, `document`, `image` e `multi`; cada produto acrescenta
 * aqui o próprio `UploadProfileDef` (com `as const`, senão a chave vira
 * `string` e `UploadProfileName` deixa de tipar). `uploadRoute: true` expõe a
 * chave na rota genérica de upload; `false` mantém o perfil restrito ao fluxo
 * interno do produto.
 */
export const PRODUCT_UPLOAD_PROFILES = [] as const satisfies readonly UploadProfileDef[]

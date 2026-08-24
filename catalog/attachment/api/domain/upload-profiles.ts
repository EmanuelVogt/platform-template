import { PRODUCT_UPLOAD_PROFILES } from "./upload/product-upload-profiles"

import type { Visibility } from "./access-policy"
import type { UploadProfileDef } from "./upload/upload-profile.types"

/** Domain não importa `attachment.config` (module-boundaries.spec.ts): só os
 * limites de bytes que `buildUploadProfiles` usa, não a config inteira. */
export interface UploadProfileConfig {
  readonly ATTACHMENT_MAX_UPLOAD_BYTES: number
  readonly ATTACHMENT_MULTI_MAX_FILE_BYTES: number
  readonly ATTACHMENT_MULTI_MAX_TOTAL_BYTES: number
}

export const BASE_UPLOAD_PROFILE_NAMES = [
  "avatar",
  "access-link-avatar",
  "document",
  "image",
  "multi",
] as const

type ProductUploadProfileKey = (typeof PRODUCT_UPLOAD_PROFILES)[number]["key"]

type RouteProductUploadProfileKey = Extract<
  (typeof PRODUCT_UPLOAD_PROFILES)[number],
  { uploadRoute: true }
>["key"]

export interface UploadProfile {
  /** "image" exige sniff de magic bytes; "any" aceita qualquer byte. */
  readonly accept: "image" | "any"
  readonly maxBytes: number
  readonly maxTotalBytes: number
  readonly maxFiles: number
  readonly visibility: Visibility
}

export const UPLOAD_PROFILES: unique symbol = Symbol("UploadProfiles")

export type UploadProfileCatalog = Record<UploadProfileName, UploadProfile>

export function buildUploadProfileNames(
  productDefs: readonly UploadProfileDef[] = PRODUCT_UPLOAD_PROFILES
): readonly string[] {
  return [...BASE_UPLOAD_PROFILE_NAMES, ...productDefs.map((def) => def.key)]
}

export const UPLOAD_PROFILE_NAMES = buildUploadProfileNames() as readonly [
  ...typeof BASE_UPLOAD_PROFILE_NAMES,
  ...ProductUploadProfileKey[],
]

export type UploadProfileName = (typeof UPLOAD_PROFILE_NAMES)[number]

export function buildRouteUploadProfileNames(
  productDefs: readonly UploadProfileDef[] = PRODUCT_UPLOAD_PROFILES
): readonly string[] {
  return [
    "document",
    "image",
    "multi",
    ...productDefs.filter((def) => def.uploadRoute).map((def) => def.key),
  ]
}

export const ROUTE_UPLOAD_PROFILE_NAMES =
  buildRouteUploadProfileNames() as readonly [
    "document",
    "image",
    "multi",
    ...RouteProductUploadProfileKey[],
  ]

export function buildUploadProfiles(
  config: UploadProfileConfig,
  productDefs: readonly UploadProfileDef[] = PRODUCT_UPLOAD_PROFILES
): UploadProfileCatalog {
  const direct: UploadProfile = {
    accept: "image",
    maxBytes: config.ATTACHMENT_MAX_UPLOAD_BYTES,
    maxTotalBytes: config.ATTACHMENT_MAX_UPLOAD_BYTES,
    maxFiles: 1,
    visibility: "authenticated",
  }
  const base: Record<string, UploadProfile> = {
    avatar: direct,
    "access-link-avatar": direct,
    image: direct,
    // Tipo livre (any), 1 arquivo, restricted: mesmo teto do antigo perfil de
    // relatório (removido), o mais próximo — o env dedicado também saiu.
    document: {
      accept: "any",
      maxBytes: 26_214_400,
      maxTotalBytes: 26_214_400,
      maxFiles: 1,
      visibility: "restricted",
    },
    multi: {
      accept: "any",
      maxBytes: config.ATTACHMENT_MULTI_MAX_FILE_BYTES,
      maxTotalBytes: config.ATTACHMENT_MULTI_MAX_TOTAL_BYTES,
      maxFiles: 100,
      visibility: "restricted",
    },
  }
  for (const def of productDefs) {
    if (def.key in base) {
      throw new Error(`Perfil de upload duplicado: ${def.key}`)
    }
    base[def.key] = {
      accept: def.accept,
      maxBytes: def.maxBytes,
      maxTotalBytes: def.maxTotalBytes,
      maxFiles: def.maxFiles,
      visibility: def.visibility,
    }
  }
  return base as UploadProfileCatalog
}

export function isUploadProfileName(value: string): value is UploadProfileName {
  return (UPLOAD_PROFILE_NAMES as readonly string[]).includes(value)
}

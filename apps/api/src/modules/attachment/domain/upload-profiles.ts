import { PRODUCT_UPLOAD_PROFILES } from "../../../shared/kernel/upload/product-upload-profiles"

import type { AttachmentConfig } from "../attachment.config"
import type { UploadProfileDef } from "../../../shared/kernel/upload/upload-profile.types"
import type { Visibility } from "./access-policy"

export const BASE_UPLOAD_PROFILE_NAMES = [
  "avatar",
  "access-link-avatar",
  "document",
  "image",
  "multi",
] as const

export type UploadProfileName =
  | (typeof BASE_UPLOAD_PROFILE_NAMES)[number]
  | (typeof PRODUCT_UPLOAD_PROFILES)[number]["key"]

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

const productProfileDefs: readonly UploadProfileDef[] = PRODUCT_UPLOAD_PROFILES

export const UPLOAD_PROFILE_NAMES: readonly string[] = [
  ...BASE_UPLOAD_PROFILE_NAMES,
  ...productProfileDefs.map((def) => def.key),
]

export function buildRouteUploadProfileNames(
  productDefs: readonly UploadProfileDef[] = PRODUCT_UPLOAD_PROFILES,
): readonly string[] {
  return [
    "document",
    "image",
    "multi",
    ...productDefs.filter((def) => def.uploadRoute).map((def) => def.key),
  ]
}

export const ROUTE_UPLOAD_PROFILE_NAMES = buildRouteUploadProfileNames() as readonly [
  "document",
  "image",
  "multi",
  ...UploadProfileName[],
]

export function buildUploadProfiles(
  config: AttachmentConfig,
  productDefs: readonly UploadProfileDef[] = PRODUCT_UPLOAD_PROFILES,
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

import type { AttachmentConfig } from "../attachment.config"
import type { Visibility } from "./access-policy"

export type UploadProfileName =
  | "avatar"
  | "access-link-avatar"
  | "credit-receipt"
  | "accommodation-type-image"
  | "feedback-attachment"
  | "report-artifact"

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

export function buildUploadProfiles(config: AttachmentConfig): UploadProfileCatalog {
  const direct: UploadProfile = {
    accept: "image",
    maxBytes: config.ATTACHMENT_MAX_UPLOAD_BYTES,
    maxTotalBytes: config.ATTACHMENT_MAX_UPLOAD_BYTES,
    maxFiles: 1,
    visibility: "authenticated",
  }
  return {
    avatar: direct,
    "access-link-avatar": direct,
    // restricted com ownerUserId nulo (upload do admin): ninguém passa na rota
    // genérica — o comprovante só sai pela rota do crédito (caminho trusted).
    "credit-receipt": { ...direct, visibility: "restricted" },
    "accommodation-type-image": direct,
    "feedback-attachment": {
      accept: "any",
      maxBytes: config.ATTACHMENT_FEEDBACK_MAX_FILE_BYTES,
      maxTotalBytes: config.ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES,
      maxFiles: 100,
      visibility: "restricted",
    },
    "report-artifact": {
      accept: "any",
      maxBytes: config.ATTACHMENT_REPORT_MAX_BYTES,
      maxTotalBytes: config.ATTACHMENT_REPORT_MAX_BYTES,
      maxFiles: 1,
      // restricted: só o solicitante baixa o próprio relatório.
      visibility: "restricted",
    },
  }
}

export function isUploadProfileName(value: string): value is UploadProfileName {
  return value in buildUploadProfiles(PROBE_CONFIG)
}

const PROBE_CONFIG: AttachmentConfig = {
  ATTACHMENT_MAX_UPLOAD_BYTES: 1,
  ATTACHMENT_ACCESS_LOG_RETENTION_DAYS: 1,
  ATTACHMENT_FEEDBACK_MAX_FILE_BYTES: 1,
  ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES: 1,
  ATTACHMENT_REPORT_MAX_BYTES: 1,
}

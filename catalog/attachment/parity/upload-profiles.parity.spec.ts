import { describe, expect, it } from "vitest"

import { parseAttachmentConfig } from "../attachment.config"
import {
  BASE_UPLOAD_PROFILE_NAMES,
  buildUploadProfiles,
  ROUTE_UPLOAD_PROFILE_NAMES,
} from "../domain/upload-profiles"

describe("attachment — perfis de upload (AD-010)", () => {
  const config = parseAttachmentConfig({})
  const profiles = buildUploadProfiles(config)

  it("mantém os cinco perfis genéricos do base-set", () => {
    expect(BASE_UPLOAD_PROFILE_NAMES).toEqual([
      "avatar",
      "access-link-avatar",
      "document",
      "image",
      "multi",
    ])
  })

  it("expõe document, image e multi na rota genérica de upload", () => {
    expect(ROUTE_UPLOAD_PROFILE_NAMES).toEqual(["document", "image", "multi"])
  })

  it("perfil multi aceita qualquer byte, até 100 arquivos, restricted", () => {
    expect(profiles.multi).toEqual({
      accept: "any",
      maxBytes: config.ATTACHMENT_MULTI_MAX_FILE_BYTES,
      maxTotalBytes: config.ATTACHMENT_MULTI_MAX_TOTAL_BYTES,
      maxFiles: 100,
      visibility: "restricted",
    })
  })

  it("perfis avatar, access-link-avatar e image exigem imagem e são authenticated", () => {
    for (const key of ["avatar", "access-link-avatar", "image"] as const) {
      expect(profiles[key]).toEqual({
        accept: "image",
        maxBytes: config.ATTACHMENT_MAX_UPLOAD_BYTES,
        maxTotalBytes: config.ATTACHMENT_MAX_UPLOAD_BYTES,
        maxFiles: 1,
        visibility: "authenticated",
      })
    }
  })
})

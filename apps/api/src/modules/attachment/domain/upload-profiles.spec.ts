import { parseAttachmentConfig } from "../attachment.config"

import {
  BASE_UPLOAD_PROFILE_NAMES,
  buildRouteUploadProfileNames,
  buildUploadProfileNames,
  buildUploadProfiles,
  isUploadProfileName,
  ROUTE_UPLOAD_PROFILE_NAMES,
  UPLOAD_PROFILE_NAMES,
} from "./upload-profiles"

import type { UploadProfile } from "./upload-profiles"
import type { UploadProfileDef } from "../../../shared/kernel/upload/upload-profile.types"

const config = parseAttachmentConfig({})

describe("BASE_UPLOAD_PROFILE_NAMES", () => {
  it("é exatamente avatar, access-link-avatar, document, image, multi", () => {
    expect(BASE_UPLOAD_PROFILE_NAMES).toEqual([
      "avatar",
      "access-link-avatar",
      "document",
      "image",
      "multi",
    ])
  })
})

describe("buildUploadProfiles", () => {
  it("mantém a política de imagem única para avatar, link de acesso e o perfil genérico image", () => {
    const profiles = buildUploadProfiles(config)
    for (const name of ["avatar", "access-link-avatar", "image"] as const) {
      expect(profiles[name]).toEqual({
        accept: "image",
        maxBytes: 5_242_880,
        maxTotalBytes: 5_242_880,
        maxFiles: 1,
        visibility: "authenticated",
      })
    }
  })

  it("dá ao perfil document tipo livre, 1 arquivo e visibilidade restricted", () => {
    expect(buildUploadProfiles(config).document).toEqual({
      accept: "any",
      maxBytes: 26_214_400,
      maxTotalBytes: 26_214_400,
      maxFiles: 1,
      visibility: "restricted",
    })
  })

  it("dá ao perfil multi tipo livre, 100 arquivos e os tetos vindos do ambiente", () => {
    expect(buildUploadProfiles(config).multi).toEqual({
      accept: "any",
      maxBytes: 524_288_000,
      maxTotalBytes: 524_288_000,
      maxFiles: 100,
      visibility: "restricted",
    })
  })

  it("respeita os tetos vindos do ambiente", () => {
    const profiles = buildUploadProfiles(
      parseAttachmentConfig({
        ATTACHMENT_MAX_UPLOAD_BYTES: "1024",
        ATTACHMENT_MULTI_MAX_FILE_BYTES: "2048",
        ATTACHMENT_MULTI_MAX_TOTAL_BYTES: "4096",
      }),
    )
    expect(profiles.avatar.maxBytes).toBe(1024)
    expect(profiles.multi.maxBytes).toBe(2048)
    expect(profiles.multi.maxTotalBytes).toBe(4096)
  })

  it("mescla um UploadProfileDef de produto no catálogo", () => {
    const fakeDef: UploadProfileDef = {
      key: "sample-product-thing",
      accept: "any",
      maxBytes: 10,
      maxTotalBytes: 10,
      maxFiles: 1,
      visibility: "restricted",
      uploadRoute: true,
    }
    const profiles = buildUploadProfiles(config, [fakeDef]) as Record<string, UploadProfile>
    expect(profiles["sample-product-thing"]).toEqual({
      accept: "any",
      maxBytes: 10,
      maxTotalBytes: 10,
      maxFiles: 1,
      visibility: "restricted",
    })
  })

  it("lança ao encontrar uma chave de produto duplicada de um nome base", () => {
    const fakeDef: UploadProfileDef = {
      key: "document",
      accept: "any",
      maxBytes: 1,
      maxTotalBytes: 1,
      maxFiles: 1,
      visibility: "restricted",
      uploadRoute: true,
    }
    expect(() => buildUploadProfiles(config, [fakeDef])).toThrow()
  })
})

describe("UPLOAD_PROFILE_NAMES / ROUTE_UPLOAD_PROFILE_NAMES", () => {
  it("UPLOAD_PROFILE_NAMES contém exatamente os 5 nomes base (sem produto no template)", () => {
    expect(UPLOAD_PROFILE_NAMES).toEqual([
      "avatar",
      "access-link-avatar",
      "document",
      "image",
      "multi",
    ])
  })

  it("buildUploadProfileNames acrescenta a chave do UploadProfileDef de produto depois dos nomes base", () => {
    const fakeDef: UploadProfileDef = {
      key: "sample-product-thing",
      accept: "any",
      maxBytes: 10,
      maxTotalBytes: 10,
      maxFiles: 1,
      visibility: "restricted",
      uploadRoute: true,
    }
    expect(buildUploadProfileNames([fakeDef])).toEqual([
      "avatar",
      "access-link-avatar",
      "document",
      "image",
      "multi",
      "sample-product-thing",
    ])
  })

  it("ROUTE_UPLOAD_PROFILE_NAMES contém só document, image e multi (avatar e access-link-avatar não sobem pela rota genérica)", () => {
    expect(ROUTE_UPLOAD_PROFILE_NAMES).toEqual(["document", "image", "multi"])
  })

  it("buildRouteUploadProfileNames inclui a chave de produto só quando uploadRoute é true", () => {
    const routable: UploadProfileDef = {
      key: "sample-routable",
      accept: "any",
      maxBytes: 1,
      maxTotalBytes: 1,
      maxFiles: 1,
      visibility: "restricted",
      uploadRoute: true,
    }
    const internal: UploadProfileDef = {
      key: "sample-internal",
      accept: "any",
      maxBytes: 1,
      maxTotalBytes: 1,
      maxFiles: 1,
      visibility: "restricted",
      uploadRoute: false,
    }
    const names = buildRouteUploadProfileNames([routable, internal])
    expect(names).toContain("sample-routable")
    expect(names).not.toContain("sample-internal")
  })
})

describe("isUploadProfileName", () => {
  it("reconhece um nome base", () => {
    expect(isUploadProfileName("multi")).toBe(true)
  })

  it("rejeita um nome desconhecido", () => {
    expect(isUploadProfileName("unknown-profile")).toBe(false)
  })
})

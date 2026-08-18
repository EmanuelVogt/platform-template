import { parseAttachmentConfig } from "../attachment.config"

import { buildUploadProfiles, isUploadProfileName } from "./upload-profiles"

const config = parseAttachmentConfig({})

describe("buildUploadProfiles", () => {
  it("mantém a política de hoje nos perfis de imagem única (avatar, link de acesso, tipo de acomodação)", () => {
    const profiles = buildUploadProfiles(config)
    for (const name of [
      "avatar",
      "access-link-avatar",
      "accommodation-type-image",
    ] as const) {
      expect(profiles[name]).toEqual({
        accept: "image",
        maxBytes: 5_242_880,
        maxTotalBytes: 5_242_880,
        maxFiles: 1,
        visibility: "authenticated",
      })
    }
  })

  it("mantém o comprovante de crédito com a mesma política de imagem única, mas restrito à rota trusted", () => {
    expect(buildUploadProfiles(config)["credit-receipt"]).toEqual({
      accept: "image",
      maxBytes: 5_242_880,
      maxTotalBytes: 5_242_880,
      maxFiles: 1,
      visibility: "restricted",
    })
  })

  it("dá ao anexo de feedback tipo livre e 500 MB tanto por arquivo quanto por lote", () => {
    expect(buildUploadProfiles(config)["feedback-attachment"]).toEqual({
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
        ATTACHMENT_FEEDBACK_MAX_FILE_BYTES: "2048",
        ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES: "4096",
      }),
    )
    expect(profiles.avatar.maxBytes).toBe(1024)
    expect(profiles["feedback-attachment"].maxBytes).toBe(2048)
    expect(profiles["feedback-attachment"].maxTotalBytes).toBe(4096)
  })

  it("expõe report-artifact restrito ao dono e com download forçado", () => {
    const profile = buildUploadProfiles(config)["report-artifact"]

    expect(profile.visibility).toBe("restricted")
    expect(profile.accept).toBe("any")
    expect(profile.maxFiles).toBe(1)
    expect(profile.maxBytes).toBe(26_214_400)
  })
})

describe("isUploadProfileName", () => {
  it("reconhece report-artifact como nome de perfil", () => {
    expect(isUploadProfileName("report-artifact")).toBe(true)
  })
})

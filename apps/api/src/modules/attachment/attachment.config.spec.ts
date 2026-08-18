import { parseAttachmentConfig } from "./attachment.config"

describe("attachment.config", () => {
  it("usa defaults", () => {
    const c = parseAttachmentConfig({})
    expect(c.ATTACHMENT_MAX_UPLOAD_BYTES).toBe(5242880)
    expect(c.ATTACHMENT_ACCESS_LOG_RETENTION_DAYS).toBe(180)
  })

  it("coage valores de env", () => {
    expect(parseAttachmentConfig({ ATTACHMENT_MAX_UPLOAD_BYTES: "100" }).ATTACHMENT_MAX_UPLOAD_BYTES).toBe(100)
  })
})

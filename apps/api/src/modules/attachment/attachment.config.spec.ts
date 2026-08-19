import { attachmentConfigSchema, parseAttachmentConfig } from "./attachment.config"

describe("attachment.config", () => {
  it("usa defaults", () => {
    const c = parseAttachmentConfig({})
    expect(c.ATTACHMENT_MAX_UPLOAD_BYTES).toBe(5242880)
    expect(c.ATTACHMENT_ACCESS_LOG_RETENTION_DAYS).toBe(180)
    expect(c.ATTACHMENT_MULTI_MAX_FILE_BYTES).toBe(524288000)
    expect(c.ATTACHMENT_MULTI_MAX_TOTAL_BYTES).toBe(524288000)
  })

  it("coage valores de env", () => {
    expect(parseAttachmentConfig({ ATTACHMENT_MAX_UPLOAD_BYTES: "100" }).ATTACHMENT_MAX_UPLOAD_BYTES).toBe(100)
    expect(
      parseAttachmentConfig({ ATTACHMENT_MULTI_MAX_FILE_BYTES: "2048" }).ATTACHMENT_MULTI_MAX_FILE_BYTES,
    ).toBe(2048)
  })

  it("não conhece mais os envs antigos de feedback/report", () => {
    expect(attachmentConfigSchema.shape).not.toHaveProperty("ATTACHMENT_FEEDBACK_MAX_FILE_BYTES")
    expect(attachmentConfigSchema.shape).not.toHaveProperty("ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES")
    expect(attachmentConfigSchema.shape).not.toHaveProperty("ATTACHMENT_REPORT_MAX_BYTES")
  })
})

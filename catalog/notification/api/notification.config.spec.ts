import { describe, expect, it } from "vitest"

import { parseNotificationConfig } from "./notification.config"

describe("notificationConfig", () => {
  it("defaults: transport log, 8 tentativas", () => {
    const cfg = parseNotificationConfig({})
    expect(cfg.MAIL_TRANSPORT).toBe("log")
    expect(cfg.DELIVERY_MAX_ATTEMPTS).toBe(8)
  })

  it("resend exige RESEND_API_KEY e MAIL_FROM (fail-fast)", () => {
    expect(() => parseNotificationConfig({ MAIL_TRANSPORT: "resend" })).toThrow(
      /RESEND_API_KEY e MAIL_FROM/
    )
  })

  it("resend com chaves presentes parseia", () => {
    const cfg = parseNotificationConfig({
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_x",
      MAIL_FROM: "no-reply@example.com",
    })
    expect(cfg.MAIL_TRANSPORT).toBe("resend")
  })

  it("DELIVERY_MAX_ATTEMPTS coage string e rejeita não-positivo", () => {
    expect(parseNotificationConfig({ DELIVERY_MAX_ATTEMPTS: "3" }).DELIVERY_MAX_ATTEMPTS).toBe(3)
    expect(() => parseNotificationConfig({ DELIVERY_MAX_ATTEMPTS: "0" })).toThrow()
  })
})

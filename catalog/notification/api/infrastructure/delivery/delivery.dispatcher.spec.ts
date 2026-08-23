import { describe, expect, it } from "vitest"

import { backoffMs, redactPayload } from "./delivery.dispatcher"

describe("backoffMs", () => {
  it("expone com cap de 5min + jitter ≤30s", () => {
    expect(backoffMs(1)).toBeGreaterThanOrEqual(2000)
    expect(backoffMs(1)).toBeLessThan(2000 + 30_000)
    expect(backoffMs(20)).toBeGreaterThanOrEqual(300_000)
    expect(backoffMs(20)).toBeLessThan(300_000 + 30_000)
  })
})

describe("redactPayload", () => {
  it("redige o link (token) e preserva o resto", () => {
    expect(
      redactPayload({ email: "a@b.com", link: "https://x/?token=raw", locale: "pt-BR" })
    ).toEqual({ email: "a@b.com", link: "[REDACTED]", locale: "pt-BR" })
  })
  it("payload sem link passa intacto", () => {
    expect(redactPayload({ email: "a@b.com" })).toEqual({ email: "a@b.com" })
  })
  it("redige token e link juntos, não só link", () => {
    expect(
      redactPayload({ email: "a@b.com", link: "https://x/?token=raw", token: "raw-secret" })
    ).toEqual({ email: "a@b.com", link: "[REDACTED]", token: "[REDACTED]" })
  })
})

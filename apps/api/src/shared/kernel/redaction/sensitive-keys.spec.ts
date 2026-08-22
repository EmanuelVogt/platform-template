import {
  isSensitiveKey,
  redactSensitive,
  SENSITIVE_KEY_FRAGMENTS,
} from "./sensitive-keys"

describe("SENSITIVE_KEY_FRAGMENTS", () => {
  it("é o vocabulário canônico", () => {
    expect(SENSITIVE_KEY_FRAGMENTS).toEqual([
      "password",
      "token",
      "secret",
      "authorization",
      "cookie",
      "link",
    ])
  })
})

describe("isSensitiveKey", () => {
  it("casa por substring case-insensitive contra os fragments default", () => {
    expect(isSensitiveKey("password")).toBe(true)
    expect(isSensitiveKey("Authorization")).toBe(true)
    expect(isSensitiveKey("accessToken")).toBe(true)
    expect(isSensitiveKey("SECRET_KEY")).toBe(true)
    expect(isSensitiveKey("Cookie")).toBe(true)
  })

  it("não casa recipientId/description (guarda de não-match)", () => {
    expect(isSensitiveKey("recipientId")).toBe(false)
    expect(isSensitiveKey("description")).toBe(false)
  })

  it("linkedId é um over-match aceito (contém 'link' como substring)", () => {
    expect(isSensitiveKey("linkedId")).toBe(true)
  })

  it("aceita uma lista de fragments customizada (ex.: log redactor com 'email')", () => {
    const fragments = ["password", "email"]
    expect(isSensitiveKey("newPassword", fragments)).toBe(true)
    expect(isSensitiveKey("currentPassword", fragments)).toBe(true)
    expect(isSensitiveKey("newEmail", fragments)).toBe(true)
    expect(isSensitiveKey("pendingEmail", fragments)).toBe(true)
  })
})

describe("redactSensitive", () => {
  it("redige um envelope aninhado (payload.payload.link)", () => {
    const input = {
      id: "evt-1",
      payload: {
        payload: {
          link: "https://example.com/reset/abc",
          recipientId: "user-1",
        },
      },
    }
    const result = redactSensitive(input)
    expect(result.changed).toBe(true)
    expect(result.value.payload.payload.link).toBe("[REDACTED]")
    expect(result.value.payload.payload.recipientId).toBe("user-1")
  })

  it("recorre em array de objetos", () => {
    const input = [
      { token: "abc", description: "ok" },
      { description: "sem segredo" },
    ]
    const result = redactSensitive(input)
    expect(result.changed).toBe(true)
    expect(result.value[0]?.token).toBe("[REDACTED]")
    expect(result.value[1]).toEqual({ description: "sem segredo" })
  })

  it("sem match nenhum, devolve a mesma referência com changed: false", () => {
    const input = { recipientId: "user-1", description: "ok" }
    const result = redactSensitive(input)
    expect(result.changed).toBe(false)
    expect(result.value).toBe(input)
  })

  it("aceita fragments customizados (email) e redige newEmail/pendingEmail", () => {
    const input = { newEmail: "a@b.com", pendingEmail: "c@d.com", id: "u1" }
    const result = redactSensitive(input, ["password", "email"])
    expect(result.changed).toBe(true)
    expect(result.value.newEmail).toBe("[REDACTED]")
    expect(result.value.pendingEmail).toBe("[REDACTED]")
    expect(result.value.id).toBe("u1")
  })
})

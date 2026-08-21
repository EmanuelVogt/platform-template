import { HmacCsrf } from "./hmac-csrf"

describe("HmacCsrf", () => {
  const csrf = new HmacCsrf("z".repeat(32))

  it("verify aceita o token assinado para a mesma sessão", () => {
    const token = csrf.sign("sess-1")
    expect(csrf.verify("sess-1", token)).toBe(true)
  })

  it("verify rejeita token de outra sessão", () => {
    const token = csrf.sign("sess-1")
    expect(csrf.verify("sess-2", token)).toBe(false)
  })

  it("verify rejeita token adulterado", () => {
    const token = csrf.sign("sess-1")
    expect(csrf.verify("sess-1", `${token}x`)).toBe(false)
  })

  it("verify rejeita assinatura de outro secret", () => {
    const other = new HmacCsrf("w".repeat(32))
    const token = other.sign("sess-1")
    expect(csrf.verify("sess-1", token)).toBe(false)
  })

  it("construtor lança para secret vazio ou curto (<32)", () => {
    expect(() => new HmacCsrf("")).toThrow()
    expect(() => new HmacCsrf("x".repeat(31))).toThrow()
  })

  it("construtor aceita secret de 32 chars", () => {
    expect(() => new HmacCsrf("z".repeat(32))).not.toThrow()
  })

  it("construtor aceita secret maior que 32 chars", () => {
    expect(() => new HmacCsrf("z".repeat(64))).not.toThrow()
  })

  it("construtor lança para secret com exatamente 31 chars (boundary)", () => {
    expect(() => new HmacCsrf("x".repeat(31))).toThrow(
      "CSRF_SECRET ausente ou curto (<32)"
    )
  })

  it("sign é determinístico: mesma sessão produz mesmo token", () => {
    expect(csrf.sign("sess-deterministic")).toBe(csrf.sign("sess-deterministic"))
  })

  it("sign produz tokens distintos para sessões distintas", () => {
    expect(csrf.sign("sess-a")).not.toBe(csrf.sign("sess-b"))
  })

  it("verify rejeita token de mesmo comprimento mas conteúdo diferente (timingSafeEqual retorna false)", () => {
    const valid = csrf.sign("sess-1")
    const sameLen = "0".repeat(valid.length)
    expect(csrf.verify("sess-1", sameLen)).toBe(false)
  })

  it("verify rejeita token vazio (comprimento diferente do esperado)", () => {
    expect(csrf.verify("sess-1", "")).toBe(false)
  })
})

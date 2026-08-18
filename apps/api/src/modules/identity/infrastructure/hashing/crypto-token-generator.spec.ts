import { CryptoTokenGenerator } from "./crypto-token-generator"

describe("CryptoTokenGenerator", () => {
  const gen = new CryptoTokenGenerator()

  it("generate retorna raw base64url e hash sha256 consistente", () => {
    const { raw, hash } = gen.generate()
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/) // base64url, sem +/=
    expect(raw.length).toBeGreaterThanOrEqual(43) // 32 bytes em base64url
    expect(hash).toHaveLength(64) // sha256 hex
    expect(gen.hashOf(raw)).toBe(hash)
  })

  it("dois generate produzem raws distintos", () => {
    expect(gen.generate().raw).not.toBe(gen.generate().raw)
  })

  it("safeEqual é true para iguais e false para diferentes", () => {
    const h = gen.hashOf("abc")
    expect(gen.safeEqual(h, h)).toBe(true)
    expect(gen.safeEqual(h, gen.hashOf("xyz"))).toBe(false)
  })

  it("safeEqual com comprimentos diferentes retorna false sem lançar", () => {
    expect(gen.safeEqual("curto", "muito-mais-longo")).toBe(false)
  })

  it("safeEqual strings vazias (comprimento zero igual) retorna true via timingSafeEqual", () => {
    expect(gen.safeEqual("", "")).toBe(true)
  })

  it("safeEqual string vazia vs não-vazia (comprimentos distintos) retorna false sem chegar ao timingSafeEqual", () => {
    expect(gen.safeEqual("", "a")).toBe(false)
    expect(gen.safeEqual("a", "")).toBe(false)
  })
})

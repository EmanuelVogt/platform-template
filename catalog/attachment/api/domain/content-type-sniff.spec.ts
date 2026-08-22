import { describe, expect, it } from "vitest"

import { sniffImageContentType } from "./content-type-sniff"

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
])

describe("sniffImageContentType", () => {
  it("detecta jpeg/png/webp", () => {
    expect(sniffImageContentType(jpeg)).toBe("image/jpeg")
    expect(sniffImageContentType(png)).toBe("image/png")
    expect(sniffImageContentType(webp)).toBe("image/webp")
  })

  it("retorna null pra bytes não-imagem", () => {
    expect(sniffImageContentType(Buffer.from("not an image"))).toBeNull()
    expect(sniffImageContentType(Buffer.from([0x00]))).toBeNull()
  })

  it("retorna null para buffer vazio", () => {
    expect(sniffImageContentType(Buffer.alloc(0))).toBeNull()
  })

  it("retorna null para buffer menor que 3 bytes (jpeg guard falha)", () => {
    expect(sniffImageContentType(Buffer.from([0xff, 0xd8]))).toBeNull()
  })

  it("retorna null para buffer menor que 8 bytes que não é jpeg (png guard falha)", () => {
    // tem bytes suficientes pro jpeg check falhar, mas não pra png (< 8)
    expect(sniffImageContentType(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull()
  })

  it("retorna null para buffer menor que 12 bytes que não é jpeg nem png (webp guard falha)", () => {
    // 8 bytes: passa o guard de jpeg e png mas não tem os 12 pra webp
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
    expect(sniffImageContentType(buf)).toBeNull()
  })

  it("retorna null quando RIFF bate mas WEBP não (assinatura webp incompleta)", () => {
    // "RIFF" nos primeiros 4 bytes, mas bytes 8-11 não são "WEBP"
    const buf = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("JPEG"),
    ])
    expect(sniffImageContentType(buf)).toBeNull()
  })

  it("retorna null quando magic bytes do jpeg são parcialmente corretos", () => {
    // 0xff 0xd8 mas terceiro byte não é 0xff
    expect(sniffImageContentType(Buffer.from([0xff, 0xd8, 0x00]))).toBeNull()
  })
})

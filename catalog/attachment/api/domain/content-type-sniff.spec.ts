import { Readable } from "node:stream"

import { sniffImageContentType, sniffImageStream } from "./content-type-sniff"
import { describe, expect, it } from "vitest"

/** `Readable.from` é object mode por padrão — um stream de upload real não é;
 *  binário explícito pra `read(n)` acumular pushes pequenos como no busboy. */
function byteStream(chunks: Buffer[]): Readable {
  return Readable.from(chunks, { objectMode: false })
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
])

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

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

describe("sniffImageStream", () => {
  it("detecta o tipo pelos primeiros bytes sem truncar o stream (unshift preserva tudo)", async () => {
    const body = Buffer.concat([png, Buffer.from("resto do arquivo png")])
    const stream = byteStream([body])

    const sniffed = await sniffImageStream(stream)
    expect(sniffed).toBe("image/png")

    const full = await drain(stream)
    expect(full.equals(body)).toBe(true)
  })

  it("preserva o conteúdo mesmo quando os bytes chegam em vários chunks pequenos", async () => {
    const body = Buffer.concat([png, Buffer.from("segunda parte, em outro chunk")])
    // 3-byte chunks força múltiplos eventos "readable" antes de acumular 16 bytes.
    const chunks: Buffer[] = []
    for (let i = 0; i < body.length; i += 3) chunks.push(body.subarray(i, i + 3))
    const stream = byteStream(chunks)

    const sniffed = await sniffImageStream(stream)
    expect(sniffed).toBe("image/png")

    const full = await drain(stream)
    expect(full.equals(body)).toBe(true)
  })

  it("retorna null para um stream cujos bytes não são imagem", async () => {
    const stream = byteStream([Buffer.from("<html>não é imagem</html>")])

    expect(await sniffImageStream(stream)).toBeNull()
  })

  it("retorna null para um stream vazio (encerra sem nenhum byte)", async () => {
    const stream = byteStream([])

    expect(await sniffImageStream(stream)).toBeNull()
  })

  it("sniffa mesmo um arquivo menor que os 16 bytes de espiada (stream termina cedo)", async () => {
    const stream = byteStream([jpeg])

    expect(await sniffImageStream(stream)).toBe("image/jpeg")
    expect((await drain(stream)).equals(jpeg)).toBe(true)
  })
})

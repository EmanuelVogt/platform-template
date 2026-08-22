import type { Readable } from "node:stream"

export type SupportedImage = "image/jpeg" | "image/png" | "image/webp"

/**
 * Detecta o tipo da imagem pelos magic bytes (não confia no Content-Type do
 * cliente). Retorna null se não bater com jpeg/png/webp.
 */
export function sniffImageContentType(buf: Buffer): SupportedImage | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg"
  }
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length >= 8 && pngSig.every((b, i) => buf[i] === b)) {
    return "image/png"
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

const SNIFF_PEEK_BYTES = 16

/**
 * Espia os primeiros bytes de um stream de upload (busboy) sem consumi-lo:
 * `readable` + `read(n)` — nunca `for await`, que ao dar `break` destrói o
 * stream de origem e trunca o arquivo pro consumidor seguinte. `read(n)` num
 * stream binário (não object mode) só devolve menos que `n` quando a origem
 * já acabou — nesse caso devolve o que sobrou, mesmo sendo menos que o pedido
 * — então um único `read` por evento já cobre acúmulo entre pushes pequenos.
 * Os bytes lidos voltam pro buffer via `unshift`: quem consumir o stream
 * depois enxerga o arquivo inteiro, do primeiro byte.
 */
export function sniffImageStream(stream: Readable): Promise<SupportedImage | null> {
  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = (): void => {
      stream.off("readable", onReadable)
      stream.off("end", onEnd)
      stream.off("error", onError)
    }
    const finish = (result: SupportedImage | null): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const onReadable = (): void => {
      const chunk = stream.read(SNIFF_PEEK_BYTES) as Buffer | null
      if (chunk === null) return
      stream.unshift(chunk)
      finish(sniffImageContentType(chunk))
    }
    const onEnd = (): void => finish(null)
    const onError = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    stream.on("readable", onReadable)
    stream.on("end", onEnd)
    stream.on("error", onError)
  })
}

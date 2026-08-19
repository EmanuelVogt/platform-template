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

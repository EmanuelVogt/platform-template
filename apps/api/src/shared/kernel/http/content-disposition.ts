/**
 * `Content-Disposition` de download forçado. O nome vem do cliente e entra num
 * header de resposta: CR/LF são removidos antes da codificação, sob pena de
 * header injection.
 */
export function buildContentDisposition(filename: string | null): string {
  const clean = (filename ?? "").replaceAll(/[\r\n"]/g, "").trim()
  const safe = clean.length > 0 ? clean : "arquivo"
  return `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`
}

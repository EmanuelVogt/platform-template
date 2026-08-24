// RFC 5987 deixa passar sem escape: alfanuméricos, - _ . ~ ! * ' ( ) — os
// últimos quatro são "sep" no RFC e alguns clientes HTTP tratam mal sem
// percent-encoding explícito no valor de `filename*`.
const RFC5987_EXTRA = /['()*]/g

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replaceAll(
    RFC5987_EXTRA,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

/**
 * `Content-Disposition` de download forçado. O nome vem do cliente e entra num
 * header de resposta: CR/LF e aspas são removidos antes da codificação, sob
 * pena de header injection. `filename=` (fallback ASCII, entre aspas) vem
 * primeiro para clientes sem suporte a RFC 5987; `filename*=UTF-8''...` depois,
 * com a faixa não-ASCII percent-encoded pelo `encodeURIComponent`.
 */
export function buildContentDisposition(filename: string | null): string {
  const clean = (filename ?? "").replaceAll(/[\r\n"]/g, "").trim()
  const safe = clean.length > 0 ? clean : "arquivo"
  const ascii = safe.replaceAll(/[^\x20-\x7E]/g, "").trim() || "arquivo"
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(safe)}`
}

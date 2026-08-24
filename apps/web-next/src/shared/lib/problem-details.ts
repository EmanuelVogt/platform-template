/** Narrowing de problem-details: suporta shape flat (mock/teste) e AxiosError aninhado. */
export function isProblem(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false
  if ("type" in e && typeof e.type === "string") return true
  const data = (e as { response?: { data?: unknown } }).response?.data
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof data.type === "string"
  )
}

/** Extrai o `type` do problem-details, seja shape flat ou AxiosError. */
export function getProblemType(e: unknown): string {
  const err = e as { type?: string; response?: { data?: { type?: string } } }
  return err.type ?? err.response?.data?.type ?? ""
}

/** Mensagem user-facing do problem-details (`detail`, senão `title`); vazio se não for problem. */
export function getProblemDetail(e: unknown): string {
  const err = e as {
    detail?: string
    title?: string
    response?: { data?: { detail?: string; title?: string } }
  }
  const data = err.response?.data
  return err.detail ?? data?.detail ?? err.title ?? data?.title ?? ""
}

/** Extrai membro de extensão RFC 7807 (flat ou AxiosError). */
export function getProblemExtension(e: unknown, key: string): unknown {
  if (typeof e !== "object" || e === null) return undefined
  const flat = (e as Record<string, unknown>)[key]
  if (flat !== undefined) return flat
  const data = (e as { response?: { data?: unknown } }).response?.data
  if (typeof data !== "object" || data === null) return undefined
  return (data as Record<string, unknown>)[key]
}

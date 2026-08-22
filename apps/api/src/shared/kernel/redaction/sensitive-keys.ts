/** Vocabulário canônico de fragmentos sensíveis, compartilhado por todo consumidor. */
export const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "link",
]

/** Substring case-insensitive contra `fragments` (default: `SENSITIVE_KEY_FRAGMENTS`). */
export function isSensitiveKey(
  key: string,
  fragments: readonly string[] = SENSITIVE_KEY_FRAGMENTS
): boolean {
  const lowerKey = key.toLowerCase()
  return fragments.some((fragment) => lowerKey.includes(fragment.toLowerCase()))
}

export type Redacted<T> = { value: T; changed: boolean }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function redactRecursively(
  value: unknown,
  fragments: readonly string[]
): Redacted<unknown> {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const result = redactRecursively(item, fragments)
      if (result.changed) changed = true
      return result.value
    })
    return changed ? { value: next, changed: true } : { value, changed: false }
  }

  if (isPlainObject(value)) {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, entryValue] of Object.entries(value)) {
      if (isSensitiveKey(key, fragments)) {
        next[key] = "[REDACTED]"
        changed = true
        continue
      }
      const result = redactRecursively(entryValue, fragments)
      next[key] = result.value
      if (result.changed) changed = true
    }
    return changed ? { value: next, changed: true } : { value, changed: false }
  }

  return { value, changed: false }
}

/**
 * Recorre objetos/arrays substituindo o valor de chaves sensíveis por
 * `"[REDACTED]"`. Sem match nenhum, devolve a MESMA referência (`changed:
 * false`) — quem consome pode pular a escrita quando nada mudou.
 */
export function redactSensitive<T>(
  value: T,
  fragments: readonly string[] = SENSITIVE_KEY_FRAGMENTS
): Redacted<T> {
  return redactRecursively(value, fragments) as Redacted<T>
}

/**
 * Lista canônica de campos PII/segredo. Fonte única: alimenta tanto a
 * redaction do pino (paths por profundidade) quanto o redactValue aplicado ao
 * corpo de request/response no log interceptor. Não divergir as listas.
 */
export const SENSITIVE_FIELDS = [
  "password",
  "token",
  "link",
  "creditCard",
  "email",
  "email_attempted",
  "emailAttempted",
  "cpf",
  "phone",
  "ip",
  "ip_address",
  "ipAddress",
  "user_agent",
  "userAgent",
  "authorization",
  "cookie",
  "set-cookie",
]

const SENSITIVE_SET = new Set(SENSITIVE_FIELDS.map((f) => f.toLowerCase()))

/**
 * Redige PII/segredo de um valor arbitrário em qualquer profundidade, por nome
 * de chave (case-insensitive contra SENSITIVE_FIELDS). Objeto vira cópia com os
 * campos sensíveis substituídos por `[REDACTED]`; array é mapeado; primitivo
 * passa. Usado pelo log interceptor para sanitizar o corpo de request/response
 * antes de logá-lo (o pino redige headers/paths; o corpo arbitrário precisa
 * desta redaction recursiva própria).
 */
export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue)
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record).map((k) =>
        SENSITIVE_SET.has(k.toLowerCase())
          ? [k, "[REDACTED]"]
          : [k, redactValue(record[k])]
      )
    )
  }
  return value
}

// pino não tem wildcard recursivo: cada profundidade exige uma entrada própria.
// Cap em 5 níveis cobre o err serializado de cliente HTTP, cujo header de auth
// vem em paths como err.response.config.headers.authorization (4 níveis).
const DEPTH_PREFIXES = [
  "",
  "*.",
  "*.*.",
  "*.*.*.",
  "*.*.*.*.",
  "*.*.*.*.*.",
]

const fieldPaths = DEPTH_PREFIXES.flatMap((prefix) =>
  SENSITIVE_FIELDS.map((field) => `${prefix}${field}`)
)

/** Paths de PII/segredo censurados em todo log. Aplicado no logger raiz pino. */
export const redactConfig = {
  paths: ["req.headers.authorization", "req.headers.cookie", ...fieldPaths],
  censor: "[REDACTED]",
}

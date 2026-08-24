import {
  isSensitiveKey,
  SENSITIVE_KEY_FRAGMENTS,
} from "../redaction/sensitive-keys"

// pino casa path por path, sem substring: cada variante de nome precisa de uma
// entrada literal aqui. redactValue não lê esta lista — casa por fragmento.
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
  "newPassword",
  "currentPassword",
  "newEmail",
  "pendingEmail",
  "passwordHash",
  "tokenHash",
  "cookieTokenHash",
]

/** Vocabulário canônico do kernel mais a PII que só o log precisa esconder. */
export const LOG_FRAGMENTS = [
  ...SENSITIVE_KEY_FRAGMENTS,
  "email",
  "cpf",
  "phone",
  "creditcard",
  "useragent",
  "user_agent",
  "set-cookie",
]

// Igualdade exata, não fragmento: `ip` como substring derrubaria `recipientId`,
// `description` e qualquer chave que apenas contenha as duas letras.
const LOG_EXACT = new Set(["ip", "ip_address", "ipaddress"])

/**
 * Redige PII/segredo em qualquer profundidade, por nome de chave. Existe além
 * do redact do pino porque o pino só cobre paths conhecidos e o corpo de
 * request/response tem forma arbitrária.
 */
export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue)
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record).map((k) =>
        isSensitiveKey(k, LOG_FRAGMENTS) || LOG_EXACT.has(k.toLowerCase())
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

export const redactConfig = {
  paths: ["req.headers.authorization", "req.headers.cookie", ...fieldPaths],
  censor: "[REDACTED]",
}

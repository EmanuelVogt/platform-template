import { z } from "zod"

// env var é sempre string; z.coerce.boolean trataria "false" como true. Este
// helper interpreta o literal corretamente.
const boolFromEnv = (def: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(def)
    .transform((v) => v === "true")

/** Schema das env vars consumidas pelo módulo identity (auth). */
export const identityConfigSchema = z
  .object({
    // --- rede / cookie ---
    WEB_ORIGIN: z.url(),
    COOKIE_NAME: z.string().min(1).default("__Host-rit_session"),
    COOKIE_SECURE: boolFromEnv("true"),
    COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).default("lax"),
    DEVICE_COOKIE_NAME: z.string().min(1).default("__Host-rit_device"),
    // 400d — teto de cookie persistente no Chrome.
    DEVICE_COOKIE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(34560000),

    // --- sessão ---
    SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(604800), // 7d
    SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(2592000), // 30d
    SESSION_TOUCH_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
    SESSION_REMEMBER_IDLE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(2592000), // 30d
    SESSION_MAX_PER_USER: z.coerce.number().int().positive().default(20),

    // --- throttle de login por conta (o teto vale somando todos os IPs) ---
    LOGIN_ACCOUNT_MAX_FAILURES: z.coerce.number().int().positive().default(10),
    LOGIN_ACCOUNT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(900),

    // --- tokens ---
    RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    VERIFY_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    ACCESS_LINK_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800), // 7 dias
    // TTL curto: conta fica inativa até confirmar; expirou → auto-revert pro e-mail antigo.
    EMAIL_CHANGE_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600), // 1h

    // --- cooldown anti-spam de e-mail (por conta, fluxos independentes) ---
    RESET_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    VERIFICATION_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    EMAIL_CHANGE_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

    // --- argon2 (floors OWASP) ---
    ARGON_MEMORY_KIB: z.coerce.number().int().min(19456).default(65536),
    ARGON_TIME_COST: z.coerce.number().int().min(2).default(3),
    ARGON_PARALLELISM: z.coerce.number().int().min(1).default(1),
    ARGON_HASH_LENGTH: z.coerce.number().int().min(32).default(32),
    ARGON_SALT_LENGTH: z.coerce.number().int().min(16).default(16),
    // Teto de argon2 em voo: acima dele o pool do libuv trava o processo todo.
    PASSWORD_HASH_MAX_IN_FLIGHT: z.coerce.number().int().positive().default(8),

    // --- pepper + política de senha ---
    PASSWORD_PEPPER: z.string().min(32),
    PASSWORD_MIN_ZXCVBN_SCORE: z.coerce.number().int().min(0).max(4).default(3),

    // --- breach check (sem default — força decisão consciente) ---
    BREACH_CHECK_MODE: z.enum(["fail_open", "fail_closed"]),
    // Liga o adapter real (HIBP). Default off em dev; true em prod para checar.
    BREACH_CHECK_ENABLED: boolFromEnv("false"),

    // --- verificação / csrf / auditoria ---
    REQUIRE_EMAIL_VERIFICATION: boolFromEnv("false"),
    CSRF_SECRET: z.string().min(32).optional(),
    SECURITY_AUDIT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(180),
  })
  .refine((c) => c.SESSION_TOUCH_INTERVAL_SECONDS < c.SESSION_IDLE_TTL_SECONDS, {
    message:
      "SESSION_TOUCH_INTERVAL_SECONDS deve ser menor que SESSION_IDLE_TTL_SECONDS",
    path: ["SESSION_TOUCH_INTERVAL_SECONDS"],
  })
  .refine(
    (c) => c.COOKIE_SAMESITE !== "none" || typeof c.CSRF_SECRET === "string",
    {
      message: "COOKIE_SAMESITE=none exige CSRF_SECRET definido",
      path: ["CSRF_SECRET"],
    },
  )
  // Prefixos __Host-/__Secure- só são aceitos pelo browser com Secure; sem isso
  // o cookie é descartado silenciosamente (quebra auth em dev sobre HTTP).
  .refine((c) => c.COOKIE_SECURE || !/^__(Host|Secure)-/.test(c.COOKIE_NAME), {
    message: "COOKIE_NAME com prefixo __Host-/__Secure- exige COOKIE_SECURE=true",
    path: ["COOKIE_SECURE"],
  })
  .refine(
    (c) => c.COOKIE_SECURE || !/^__(Host|Secure)-/.test(c.DEVICE_COOKIE_NAME),
    {
      message:
        "DEVICE_COOKIE_NAME com prefixo __Host-/__Secure- exige COOKIE_SECURE=true",
      path: ["COOKIE_SECURE"],
    },
  )

export type IdentityConfig = z.infer<typeof identityConfigSchema>

/** Token DI da config do módulo identity. */
export const IDENTITY_CONFIG = Symbol("IDENTITY_CONFIG")

let cached: IdentityConfig | null = null

/** Parseia uma fonte de env (puro, sem cache) — usado por loadIdentityConfig e testes. */
export function parseIdentityConfig(source: NodeJS.ProcessEnv): IdentityConfig {
  const parsed = identityConfigSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Configuração do módulo identity inválida:\n${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

/** Valida e memoiza a config a partir de process.env (fail-fast no boot). */
export function loadIdentityConfig(): IdentityConfig {
  if (!cached) {
    cached = parseIdentityConfig(process.env)
  }
  return cached
}

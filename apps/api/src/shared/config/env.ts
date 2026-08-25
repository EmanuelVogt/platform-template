import { z } from "zod"

/** Compartilhado com módulos que precisam do mesmo enum (ex.: notification.config.ts). */
export const nodeEnvSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
])

const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .optional(),
    DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:\/\//.test(v), {
      message: "DATABASE_URL deve usar scheme postgres:// ou postgresql://",
    }),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_SSL: z.enum(["disable", "require"]),
    // PEM costuma vir com `\n` escapado (variável de ambiente de linha única);
    // desescapa antes de entregar ao driver pg.
    DATABASE_SSL_CA: z
      .string()
      .optional()
      .transform((v) => v?.replaceAll("\\n", "\n")),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(10000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30000),
    DATABASE_IDLE_IN_TX_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(30000),
    DATABASE_POOL_MAX_WAITING: z.coerce.number().int().positive().default(20),
    DATABASE_POOL_ACQUIRE_WARN_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(500),
    REDIS_URL: z.url().refine((v) => /^rediss?:\/\//.test(v), {
      message: "REDIS_URL deve usar scheme redis:// ou rediss://",
    }),
    REDIS_ALLOW_PLAINTEXT: z.stringbool().default(false),
    OTEL_SERVICE_NAME: z.string().min(1).default("api"),
    SERVICE_VERSION: z.string().min(1).default("0.0.1"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.union([z.url(), z.literal("")]).optional(),
    DOCS_ENABLED: z.stringbool().default(false),
    OUTBOX_DEAD_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    // Seleciona o pacote de mensagens do kernel (shared/kernel/i18n). O
    // default reproduz as strings de hoje sem nenhuma mudança.
    DEFAULT_LOCALE: z.string().min(1).default("pt-BR"),
    // Fuso da agregação por dia/semana. Vira literal SQL em
    // shared/kernel/clock/bucket-sql.ts, então o boot recusa qualquer nome fora
    // do conjunto IANA que o runtime conhece. Ausente → UTC lá, com aviso.
    APP_TIMEZONE: z
      .string()
      .refine(
        (v) => v === "UTC" || Intl.supportedValuesOf("timeZone").includes(v),
        {
          message:
            "APP_TIMEZONE deve ser um fuso IANA conhecido pelo runtime (ex.: UTC, America/Sao_Paulo)",
        }
      )
      .optional(),

    // --- rede / proxy (consumido pelo app shell: CORS, trust proxy) ---
    // Cada módulo declara num config próprio o que ele consome; aqui só entra
    // o que a casca do template lê.
    WEB_ORIGIN: z.url(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === "production" &&
      data.REDIS_URL.startsWith("redis://") &&
      !data.REDIS_ALLOW_PLAINTEXT
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message:
          "REDIS_URL em produção exige rediss:// ou REDIS_ALLOW_PLAINTEXT=true",
      })
    }
  })

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

/** Valida uma fonte de env (puro, sem cache) — usado por loadEnv e por testes. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Configuração de ambiente inválida:\n${z.prettifyError(parsed.error)}`
    )
  }
  return parsed.data
}

/**
 * Valida TODAS as env vars (fail-fast). Memoizado — a 1ª chamada no boot
 * derruba o processo com erro claro se algo faltar/for inválido. Função pura
 * (não Nest) de propósito: o tracing precisa validar antes do NestFactory.
 */
export function loadEnv(): Env {
  if (cached) {
    return cached
  }
  cached = parseEnv(process.env)
  return cached
}

export function env(): Env {
  return loadEnv()
}

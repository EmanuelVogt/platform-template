import { z } from "zod"

/** Schema das env vars do módulo notification (mail movido do identity). */
export const notificationConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MAIL_TRANSPORT: z.enum(["log", "resend"]).default("log"),
    RESEND_API_KEY: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(1).optional(),
    DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  })
  .refine(
    (c) =>
      c.MAIL_TRANSPORT !== "resend" ||
      (typeof c.RESEND_API_KEY === "string" && typeof c.MAIL_FROM === "string"),
    {
      message: "MAIL_TRANSPORT=resend exige RESEND_API_KEY e MAIL_FROM",
      path: ["MAIL_TRANSPORT"],
    }
  )

export type NotificationConfig = z.infer<typeof notificationConfigSchema>

/** Token DI da config do módulo notification. */
export const NOTIFICATIONS_CONFIG = Symbol("NOTIFICATIONS_CONFIG")

let cached: NotificationConfig | null = null

/** Parseia uma fonte de env (puro, sem cache) — usado pelo load e por testes. */
export function parseNotificationConfig(
  source: NodeJS.ProcessEnv
): NotificationConfig {
  const parsed = notificationConfigSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Configuração do módulo notification inválida:\n${z.prettifyError(parsed.error)}`
    )
  }
  return parsed.data
}

/** Valida e memoiza a config a partir de process.env (fail-fast no boot). */
export function loadNotificationConfig(): NotificationConfig {
  if (!cached) {
    cached = parseNotificationConfig(process.env)
  }
  return cached
}

import { z } from "zod"

export const storageConfigSchema = z.object({
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ENDPOINT: z.url(),
  STORAGE_REGION: z.string().min(1),
  STORAGE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  STORAGE_MAX_SOCKETS: z.coerce.number().int().positive().default(50),
})

export type StorageConfig = z.infer<typeof storageConfigSchema>

export const STORAGE_CONFIG: unique symbol = Symbol("STORAGE_CONFIG")

const STORAGE_PRESENCE_KEYS = [
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
] as const

/** SEAM-05: qualquer uma presente conta como "configurado" — configuração parcial ainda falha em `parseStorageConfig`. */
export function isStorageConfigured(source: NodeJS.ProcessEnv): boolean {
  return STORAGE_PRESENCE_KEYS.some((key) => Boolean(source[key]))
}

export function parseStorageConfig(source: NodeJS.ProcessEnv): StorageConfig {
  const parsed = storageConfigSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Configuração de storage inválida:\n${z.prettifyError(parsed.error)}`
    )
  }
  return parsed.data
}

let cached: StorageConfig | null | undefined

/** `null` quando storage não está configurado — boot segue, a 1ª chamada real falha. */
export function loadStorageConfig(): StorageConfig | null {
  if (cached === undefined) {
    cached = isStorageConfigured(process.env)
      ? parseStorageConfig(process.env)
      : null
  }
  return cached
}

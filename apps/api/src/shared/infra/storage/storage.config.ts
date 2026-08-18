import { z } from "zod"

/** Env vars do storage R2. Validadas no boot (fail-fast). */
export const storageConfigSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.url(),
})

export type StorageConfig = z.infer<typeof storageConfigSchema>

export const STORAGE_CONFIG: unique symbol = Symbol("STORAGE_CONFIG")

let cached: StorageConfig | null = null

export function parseStorageConfig(source: NodeJS.ProcessEnv): StorageConfig {
  const parsed = storageConfigSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Configuração de storage inválida:\n${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

export function loadStorageConfig(): StorageConfig {
  if (!cached) {
    cached = parseStorageConfig(process.env)
  }
  return cached
}

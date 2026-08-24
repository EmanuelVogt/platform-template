import { z } from "zod"

/** Variáveis de ambiente do front, validadas no boot — falha cedo se faltar. */
const envSchema = z.object({
  VITE_API_URL: z.string().min(1),
})

export const env = envSchema.parse(import.meta.env)

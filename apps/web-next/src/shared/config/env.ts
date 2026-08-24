import { z } from "zod"

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
})

const parsed = envSchema.parse(process.env)

export const env = {
  apiUrl: parsed.NEXT_PUBLIC_API_URL,
}

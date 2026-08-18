import type { Response } from "supertest"

/**
 * Lê os headers Set-Cookie de uma resposta supertest como string[]. Os @types do
 * supertest declaram `headers` como Record<string, string>, mas `set-cookie` é
 * multi-valor (string[]) em runtime — a união honesta deixa o `Array.isArray`
 * fazer o narrowing, contendo a divergência de tipo num único lugar (sem cast).
 */
export function setCookies(res: Response): string[] {
  const raw: string | string[] | undefined = res.headers["set-cookie"]
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

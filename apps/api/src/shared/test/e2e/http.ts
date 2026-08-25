import type { Response } from "supertest"

/**
 * Os @types do supertest declaram `headers` como Record<string, string>, mas
 * `set-cookie` é multi-valor em runtime — a união honesta deixa o
 * `Array.isArray` fazer o narrowing e contém a divergência num lugar só.
 */
export function cookieHeader(res: Response): string[] {
  const raw: string | string[] | undefined = res.headers["set-cookie"]
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

export function cookieValue(res: Response, name: string): string | undefined {
  const prefix = `${name}=`
  const cookie = cookieHeader(res).find((entry) => entry.startsWith(prefix))
  if (cookie === undefined) return undefined
  return cookie.slice(prefix.length).split(";")[0]
}

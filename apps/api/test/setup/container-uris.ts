/**
 * Handshake entre o `globalSetup` (processo pai) e os workers: o pai publica as
 * URIs dos containers no próprio `process.env`, que os workers herdam no fork.
 * Foi arquivo em disco (`.tc-uri`) até dois runs simultâneos no mesmo checkout
 * passarem a se sobrescrever — o run mais antigo apontava para o banco do novo
 * e quebrava com 500 espalhados.
 */
function requiredUri(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} ausente: as URIs dos containers vêm do globalSetup. Rode pelo config que o declara (test:int / test:e2e), não com jest avulso.`
    )
  }
  return value
}

export const POSTGRES_URI_ENV = "TC_POSTGRES_URI"
export const REDIS_URI_ENV = "TC_REDIS_URI"

export function containerPostgresUri(): string {
  return requiredUri(POSTGRES_URI_ENV)
}

export function containerRedisUri(): string {
  return requiredUri(REDIS_URI_ENV)
}

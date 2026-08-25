import { sql } from "drizzle-orm"

import { env } from "../../config/env"
import { createRootLogger } from "../logging/logger.factory"

import type { SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

export type BucketUnit = "day" | "week"

const FALLBACK_TIME_ZONE = "UTC"

// `Intl.supportedValuesOf` lista só os fusos primários da IANA — `UTC`, que é
// alias canônico, fica de fora e entra à mão por ser o default do kernel.
const SUPPORTED_TIME_ZONES: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf("timeZone"),
  FALLBACK_TIME_ZONE,
])

// Fuso e unidade entram como literal, nunca como parâmetro: o Postgres não
// consegue inferir o tipo de um bind em `AT TIME ZONE $n` e recusa a query.
// O conjunto fechado é o que garante que nenhum texto de fora vira SQL.
const UNIT: Record<BucketUnit, SQL> = {
  day: sql.raw("'day'"),
  week: sql.raw("'week'"),
}

/**
 * Nome de fuso que pode virar literal SQL. Ausente → `UTC`, avisando o chamador;
 * fora do conjunto fechado → erro, porque a partir daqui o texto vira SQL cru.
 */
export function resolveTimeZone(
  configured: string | undefined,
  onFallback: (fallback: string) => void
): string {
  if (configured === undefined) {
    onFallback(FALLBACK_TIME_ZONE)
    return FALLBACK_TIME_ZONE
  }
  if (!SUPPORTED_TIME_ZONES.has(configured)) {
    throw new Error(
      `APP_TIMEZONE não é um fuso IANA conhecido pelo runtime: ${configured}`
    )
  }
  return configured
}

let resolved: string | null = null

/**
 * Fuso da aplicação, resolvido uma única vez por processo — é o que faz o aviso
 * de fallback sair no boot e não a cada query.
 */
export function appTimeZone(
  onFallback: (fallback: string) => void = warnFallback
): string {
  resolved ??= resolveTimeZone(env().APP_TIMEZONE, onFallback)
  return resolved
}

function warnFallback(fallback: string): void {
  createRootLogger().warn(
    { fallback },
    "APP_TIMEZONE ausente: agregação por dia/semana usa o fuso padrão"
  )
}

/**
 * Início do dia ou da semana local do registro, em milissegundos desde a época.
 * Sai como número, não como timestamp, porque expressão crua não passa pelo
 * conversor de coluna do drizzle e chegaria à aplicação como texto do Postgres.
 * Agrupar por esta expressão dá a mesma chave que a aplicação calcula.
 */
export function bucketOf(column: PgColumn, unit: BucketUnit): SQL<number> {
  const zone = sql.raw(`'${appTimeZone()}'`)
  return sql<number>`(extract(epoch from date_trunc(${UNIT[unit]}, ${column} AT TIME ZONE ${zone}) AT TIME ZONE ${zone}) * 1000)::double precision`
}

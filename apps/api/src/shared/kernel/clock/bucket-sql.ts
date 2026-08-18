import { sql } from "drizzle-orm"

import type { SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

export type BucketUnit = "day" | "week"

// Fuso e unidade entram como literal, nunca como parâmetro: o Postgres não
// consegue inferir o tipo de um bind em `AT TIME ZONE $n` e recusa a query.
// O mapa fechado é o que garante que nenhum texto de fora vira SQL.
const CLINIC_TZ = sql.raw("'America/Sao_Paulo'")

const UNIT: Record<BucketUnit, SQL> = {
  day: sql.raw("'day'"),
  week: sql.raw("'week'"),
}

/**
 * Início do dia ou da semana local do registro, em milissegundos desde a época.
 * Sai como número, não como timestamp, porque expressão crua não passa pelo
 * conversor de coluna do drizzle e chegaria à aplicação como texto do Postgres.
 * Agrupar por esta expressão dá a mesma chave que a aplicação calcula.
 */
export function bucketOf(column: PgColumn, unit: BucketUnit): SQL<number> {
  return sql<number>`(extract(epoch from date_trunc(${UNIT[unit]}, ${column} AT TIME ZONE ${CLINIC_TZ}) AT TIME ZONE ${CLINIC_TZ}) * 1000)::double precision`
}

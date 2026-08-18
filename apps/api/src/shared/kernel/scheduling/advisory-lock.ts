import { sql } from "drizzle-orm"

import type { DrizzleExecutor } from "../../infra/database/drizzle.provider"
import type { ClientBase } from "pg"

// Namespace dos advisory locks de manutenção (1º arg de pg_try_advisory_lock).
// Isola estes locks de qualquer outro advisory lock no mesmo banco. 0x6d61696e = "main".
export const MAINTENANCE_LOCK_NAMESPACE = 0x6d61_696e

// Namespace próprio isola do de manutenção — mesmo mecanismo, sem colisão de lockId.
export const SCHEDULING_LOCK_NAMESPACE = 0x7363_6864 // "schd"

// FNV-1a: hash determinístico de string para lockId int4 assinado (pg_advisory exige int4).
export function hashLockId(...parts: readonly string[]): number {
  let h = 0x811c_9dc5
  const s = parts.join(" ")
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x0100_0193)
  }
  return h | 0
}

// Bloqueia em vez de `try`: quem chama quer serializar execuções concorrentes
// da mesma chave (esperar a vez), não pular a 2ª tentativa.
export async function advisoryXactLock(
  executor: DrizzleExecutor,
  namespace: number,
  lockId: number
): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(${namespace}, ${lockId})`)
}

/**
 * Tenta o advisory lock **session-scoped** `(NAMESPACE, lockId)` na conexão
 * pinada `client`. `true` = pegou. Variante `try`: sessão concorrente disputando
 * o mesmo lock recebe `false` em vez de bloquear (preserva o skip-when-locked).
 * Diferente do xact lock, **não solta sozinho** — exige `advisorySessionUnlock`
 * na MESMA conexão. Use pra corpo de job longo, fora de transação envolvente.
 * `ClientBase` aceita tanto `PoolClient` (conexão pinada do pool) quanto
 * `Client` (conexão dedicada, fora do pool de aplicação) — só `query` é usado.
 */
export async function tryAdvisorySessionLock(
  client: ClientBase,
  lockId: number
): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1, $2) AS locked",
    [MAINTENANCE_LOCK_NAMESPACE, lockId]
  )
  return result.rows[0]?.locked ?? false
}

/** Solta o advisory lock session-scoped na mesma conexão que o tomou. */
export async function advisorySessionUnlock(
  client: ClientBase,
  lockId: number
): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1, $2)", [
    MAINTENANCE_LOCK_NAMESPACE,
    lockId,
  ])
}

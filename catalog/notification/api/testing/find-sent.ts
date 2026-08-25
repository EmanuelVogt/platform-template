import type { Pool } from "pg"

export type SentDelivery<T = unknown> = {
  id: string
  status: string
  payload: T
}

/** Probe pro `until` do `drainOutbox`: a delivery `sent` do tipo, ou undefined
 *  enquanto o dispatcher ainda não a marcou. */
export async function findSent<T = unknown>(
  pool: Pool,
  type: string
): Promise<SentDelivery<T> | undefined> {
  const r = await pool.query<SentDelivery<T>>(
    "select id, status, payload from notification.notification_deliveries where type = $1",
    [type]
  )
  return r.rows[0]?.status === "sent" ? r.rows[0] : undefined
}

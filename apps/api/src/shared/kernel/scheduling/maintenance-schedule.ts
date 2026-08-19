/** Definição de um job de manutenção: quando roda e qual advisory lock segura. */
export type MaintenanceJobSpec = {
  /** Expressão cron padrão (`min hora dia mês diaSemana`). */
  readonly cron: string
  /** Identidade do advisory lock; única por job **entre os dois modos** (o espaço
   * de advisory lock do Postgres é compartilhado entre xact e session locks). */
  readonly lockId: number
  /**
   * `true` = corpo roda numa transação do pool de aplicação, aberta DEPOIS do
   * lock. Ausente (default) = o corpo abre as próprias transações.
   */
  readonly atomic?: boolean
  /** Fuso IANA do cron. Ausente = UTC (comportamento histórico do registro). */
  readonly timeZone?: string
}

/**
 * Registro central dos jobs de manutenção — fonte única de horário e identidade
 * de lock. O staggering vive aqui, não hardcoded em `@Cron` espalhado: ajustar o
 * horário de um job é editar uma linha. Adicionar job = nova entrada aqui +
 * `@MaintenanceJob("<name>")` no método.
 */
export const MAINTENANCE_SCHEDULE = {
  "outbox.purge": { cron: "0 3 * * *", lockId: 1 },
  "idempotency.purge": { cron: "15 3 * * *", lockId: 2 },
} as const satisfies Record<string, MaintenanceJobSpec>

export type MaintenanceJobName = keyof typeof MAINTENANCE_SCHEDULE

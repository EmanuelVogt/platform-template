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
  "delivery.purge": { cron: "30 3 * * *", lockId: 3 },
  // Frequente: reativa contas cuja troca de e-mail expirou sem confirmação.
  "email-change.revert": { cron: "*/15 * * * *", lockId: 4 },
  // Retention da trilha de auth (LGPD): apaga eventos além da janela via escape hatch.
  "auth-events.purge": { cron: "45 3 * * *", lockId: 5 },
  // Retention da trilha de auditoria (LGPD): apaga entradas além da janela via escape hatch.
  "audit.purge": { cron: "0 4 * * *", lockId: 6 },
  // Retention do access log de attachments: DELETE em lotes com commit próprio
  // — `atomic` aqui prenderia a conexão do pool pela purga inteira.
  "attachment-access-log.purge": { cron: "30 4 * * *", lockId: 7 },
  // Expurgo de anexos pendentes órfãos: subiu pela API mas a entidade que o
  // confirmaria nunca foi salva (> 24 h).
  "attachment-pending.purge": { cron: "0 5 * * *", lockId: 8 },
} as const satisfies Record<string, MaintenanceJobSpec>

export type MaintenanceJobName = keyof typeof MAINTENANCE_SCHEDULE

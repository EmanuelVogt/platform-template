import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { AuthEvent, AuthEventType } from "../entities/auth-event.entity"

/** Parâmetros de paginação do histórico (subset da listagem do ADR 0017). */
export type AuthEventListParams = {
  page: number
  pageSize: number
  order?: "asc" | "desc"
}

/**
 * Auditoria. `record` escreve via token DRIZZLE direto (FORA da tx de negócio,
 * commit imediato) para que eventos de FALHA (login_failed, account_locked) não
 * sumam num rollback. `recordInTx` atrela eventos de SUCESSO à tx corrente e
 * EXIGE tx ativa — lança fora de tx (não degrada pro executor raiz em silêncio).
 */
export interface AuthEventRepository {
  record(event: AuthEvent): Promise<void>
  recordInTx(event: AuthEvent): Promise<void>
  /** Histórico do próprio dono, filtrado pela allowlist, paginado por offset. */
  listByUser(
    userId: string,
    params: AuthEventListParams,
    allowlist: readonly AuthEventType[]
  ): Promise<PaginatedResult<AuthEvent>>
  /**
   * Purga eventos com `created_at < cutoff` (retention/LGPD). EXIGE tx aberta:
   * liga o escape hatch `app.auth_events_purge` (GUC transaction-scoped) e só
   * então apaga — fora de tx o GUC não sobreviveria ao statement do DELETE.
   * Retorna quantos removeu.
   */
  deleteOlderThan(cutoff: Date): Promise<number>
}

export const AUTH_EVENT_REPOSITORY: unique symbol = Symbol(
  "AuthEventRepository"
)

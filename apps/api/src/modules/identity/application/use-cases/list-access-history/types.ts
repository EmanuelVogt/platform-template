import type { PaginatedResult } from "../../../../../shared/kernel/listing/paginated"
import type { AuthEventType } from "../../../domain/entities/auth-event.entity"
import type { AuthEventListParams } from "../../../domain/ports/auth-event.repository"
import type { AccessHistoryItemView } from "../../views"

/**
 * Allowlist do histórico (spec §5.4): eventos de segurança do próprio dono.
 * Fora: register, rate_limited_burst, breach_check_skipped, access_link_*, password_set, admin_action
 * (admin-facing), session_expired (ruído), *_requested (intermediários).
 * Fonte ÚNICA — o contrato Zod deriva o enum daqui.
 */
export const ACCESS_HISTORY_EVENT_TYPES = [
  "login_success",
  "login_failed",
  "logout",
  "session_revoked",
  "sessions_revoked_all",
  "session_ip_changed",
  "password_changed",
  "password_reset_completed",
  "account_locked",
  "account_unlocked",
  "email_changed",
  "email_verified",
  "device_revoked",
] as const satisfies readonly AuthEventType[]

export type ListAccessHistoryInput = AuthEventListParams

export type ListAccessHistoryOutput = PaginatedResult<AccessHistoryItemView>

import { ulid } from 'ulid';

export type AuthEventType =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'account_locked'
  | 'account_unlocked'
  | 'logout'
  | 'session_revoked'
  | 'sessions_revoked_all'
  | 'session_expired'
  | 'session_ip_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_changed'
  | 'email_change_requested'
  | 'email_changed'
  | 'email_verified'
  | 'breach_check_skipped'
  | 'rate_limited_burst'
  | 'rate_limiter_degraded'
  | 'access_link_sent'
  | 'access_link_resent'
  | 'password_set'
  | 'admin_action'
  | 'device_revoked'
  | 'user_deleted'
  | 'user_restored'
  | 'user_purged'
  | 'access_link_cancelled';

export interface AuthEventProps {
  readonly id: string;
  /** Quem sofreu a ação. Null em eventos sem user resolvido (ex.: rate-limit por IP). */
  readonly userId: string | null;
  /** Quem executou (admin). Null quando o próprio user agiu. */
  readonly actorUserId: string | null;
  readonly eventType: AuthEventType;
  /** Hash do email (LGPD). NUNCA o email cru. */
  readonly emailHash: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly correlationId: string;
  readonly traceId: string | null;
  readonly spanId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export type CreateAuthEventInput = Omit<AuthEventProps, 'id' | 'createdAt'>;

export class AuthEvent {
  readonly props: AuthEventProps;

  private constructor(props: AuthEventProps) {
    this.props = Object.freeze(props);
  }

  /** Hidrata a partir de props persistidas (repo). */
  static fromProps(props: AuthEventProps): AuthEvent {
    return new AuthEvent(props);
  }

  /** Cria um evento de auditoria. emailHash já vem hasheado pela infra. */
  static create(input: CreateAuthEventInput): AuthEvent {
    return new AuthEvent({
      id: ulid(),
      ...input,
      createdAt: new Date(),
    });
  }
}

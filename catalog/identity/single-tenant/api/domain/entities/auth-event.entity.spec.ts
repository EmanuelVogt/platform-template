import { describe, expect, it } from "vitest"

import { AuthEvent, type AuthEventType } from './auth-event.entity';

describe('AuthEvent.create', () => {
  it('gera id ULID e createdAt, preserva campos', () => {
    const event = AuthEvent.create({
      userId: 'user-1',
      actorUserId: null,
      eventType: 'login_failed',
      emailHash: 'abc123hash',
      ip: '203.0.113.1',
      userAgent: 'jest',
      correlationId: 'corr-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      metadata: { reason: 'wrong_password' },
    });
    expect(event.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(event.props.createdAt).toBeInstanceOf(Date);
    expect(event.props.eventType).toBe('login_failed');
    expect(event.props.emailHash).toBe('abc123hash');
    expect(event.props.metadata).toEqual({ reason: 'wrong_password' });
  });

  it('aceita userId null, emailHash null e metadata null', () => {
    const event = AuthEvent.create({
      userId: null,
      actorUserId: null,
      eventType: 'rate_limited_burst',
      emailHash: null,
      ip: null,
      userAgent: null,
      correlationId: 'corr-2',
      traceId: null,
      spanId: null,
      metadata: null,
    });
    expect(event.props.userId).toBeNull();
    expect(event.props.emailHash).toBeNull();
    expect(event.props.metadata).toBeNull();
  });

  it('cobre variantes do enum AuthEventType', () => {
    const types = [
      'register',
      'login_success',
      'account_locked',
      'sessions_revoked_all',
      'session_ip_changed',
      'password_reset_completed',
      'email_changed',
      'breach_check_skipped',
      'admin_action',
    ] as const;
    for (const eventType of types) {
      const event = AuthEvent.create({
        userId: 'u',
        actorUserId: null,
        eventType,
        emailHash: null,
        ip: null,
        userAgent: null,
        correlationId: 'c',
        traceId: null,
        spanId: null,
        metadata: null,
      });
      expect(event.props.eventType).toBe(eventType);
    }
  });
});

describe('AuthEvent — imutabilidade em runtime', () => {
  it('props é congelado: escrita direta lança', () => {
    const event = AuthEvent.create({
      userId: 'user-1',
      actorUserId: null,
      eventType: 'login_failed',
      emailHash: null,
      ip: null,
      userAgent: null,
      correlationId: 'corr-1',
      traceId: null,
      spanId: null,
      metadata: null,
    });
    expect(() => {
      (event.props as { eventType: AuthEventType }).eventType = 'logout';
    }).toThrow();
  });
});

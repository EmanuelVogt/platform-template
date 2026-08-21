import { DomainError } from '../../../shared/kernel/errors/domain.error';

import {
  InvalidCredentialsError,
  WeakPasswordError,
  InvalidResetTokenError,
  SessionNotFoundError,
  RateLimitedError,
} from './errors';

describe('errors de domínio identity', () => {
  it('todos os erros estendem DomainError', () => {
    const errors = [
      new InvalidCredentialsError(),
      new WeakPasswordError(),
      new InvalidResetTokenError(),
      new SessionNotFoundError(),
      new RateLimitedError(30),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('InvalidCredentialsError: status 401, type estável, título pt-BR', () => {
    const err = new InvalidCredentialsError();
    expect(err.status).toBe(401);
    expect(err.type).toBe('https://errors.example.com/identity/invalid-credentials');
    expect(err.title).toBe('Credenciais inválidas');
  });

  it('InvalidCredentialsError é UMA classe estável em todos os caminhos (anti-enumeração)', () => {
    const userMissing = new InvalidCredentialsError();
    const wrongPass = new InvalidCredentialsError();
    const locked = new InvalidCredentialsError();
    for (const err of [userMissing, wrongPass, locked]) {
      expect(err.type).toBe('https://errors.example.com/identity/invalid-credentials');
      expect(err.status).toBe(401);
      expect(err.message).toBe('Credenciais inválidas');
    }
  });

  it('WeakPasswordError: status 422', () => {
    const err = new WeakPasswordError();
    expect(err.status).toBe(422);
    expect(err.type).toBe('https://errors.example.com/identity/weak-password');
    expect(err.title).toBe('Senha fraca');
  });

  it('InvalidResetTokenError: status 400', () => {
    const err = new InvalidResetTokenError();
    expect(err.status).toBe(400);
    expect(err.type).toBe('https://errors.example.com/identity/invalid-reset-token');
  });

  it('SessionNotFoundError: status 404', () => {
    const err = new SessionNotFoundError();
    expect(err.status).toBe(404);
    expect(err.type).toBe('https://errors.example.com/identity/session-not-found');
  });

  it('RateLimitedError: status 429 e carrega retryAfterSeconds', () => {
    const err = new RateLimitedError(45);
    expect(err.status).toBe(429);
    expect(err.type).toBe('https://errors.example.com/identity/rate-limited');
    expect(err.retryAfterSeconds).toBe(45);
  });
});

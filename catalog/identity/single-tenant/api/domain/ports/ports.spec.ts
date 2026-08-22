import { RATE_LIMITER } from '../../../../shared/kernel/rate-limit/rate-limiter.port';

import { AUTH_EVENT_REPOSITORY } from './auth-event.repository';
import { BREACH_CHECK } from './breach-check';
import { CSRF } from './csrf';
import { PASSWORD_HASHER } from './password-hasher';
import { PASSWORD_STRENGTH } from './password-strength';
import { SESSION_REPOSITORY } from './session.repository';
import { TOKEN_GENERATOR } from './token-generator';
import { USER_REPOSITORY } from './user.repository';
import { VERIFICATION_TOKEN_REPOSITORY } from './verification-token.repository';

describe('ports — tokens de injeção', () => {
  const entries = [
    [USER_REPOSITORY, 'UserRepository'],
    [SESSION_REPOSITORY, 'SessionRepository'],
    [VERIFICATION_TOKEN_REPOSITORY, 'VerificationTokenRepository'],
    [AUTH_EVENT_REPOSITORY, 'AuthEventRepository'],
    [PASSWORD_HASHER, 'PasswordHasher'],
    [PASSWORD_STRENGTH, 'PasswordStrength'],
    [BREACH_CHECK, 'BreachCheck'],
    [TOKEN_GENERATOR, 'TokenGenerator'],
    // RATE_LIMITER mora no kernel (shared/kernel/rate-limit): o seam é
    // compartilhado com attachment, identity só consome.
    [RATE_LIMITER, 'RateLimiter'],
    [CSRF, 'Csrf'],
  ] as const;

  it('todos os tokens são Symbol', () => {
    for (const [token] of entries) {
      expect(typeof token).toBe('symbol');
    }
  });

  it('todos os tokens são únicos (sem colisão entre portas)', () => {
    const tokens = entries.map(([t]) => t);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it.each(entries)(
    'descrição de %s é "%s" (protege contra copiar/colar da string errada)',
    (token, expectedDescription) => {
      expect(token.description).toBe(expectedDescription);
    },
  );
});

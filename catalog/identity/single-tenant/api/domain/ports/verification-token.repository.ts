import type { TokenType, VerificationToken } from '../entities/verification-token.entity';

export interface VerificationTokenRepository {
  create(token: VerificationToken): Promise<void>;
  /**
   * Consome atômico: UPDATE ... SET consumed_at = now
   * WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now AND type = $2
   * RETURNING user_id. Retorna null se não houver linha elegível.
   */
  consumeByHash(hash: string, type: TokenType, now: Date): Promise<{ userId: string } | null>;
  /** Invalida todos os tokens pendentes de um tipo para o user. */
  invalidateAllForUser(userId: string, type: TokenType): Promise<void>;
  /** Leitura não-consuntiva: token válido (não consumido, não expirado) por hash+type. Pré-validação do GET. */
  findActiveByHash(
    hash: string,
    type: TokenType,
    now: Date,
  ): Promise<{ userId: string; expiresAt: Date } | null>;
  /** Último token do tipo para o user (por createdAt desc) — estado do link de acesso p/ lista e resend. */
  findLatestForUser(
    userId: string,
    type: TokenType,
  ): Promise<{ expiresAt: Date; consumedAt: Date | null } | null>;
}

export const VERIFICATION_TOKEN_REPOSITORY: unique symbol = Symbol('VerificationTokenRepository');

import type { Session } from '../entities/session.entity';

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findByTokenHash(hash: string): Promise<Session | null>;
  /** UPDATE condicional throttled de lastSeenAt/expiresAt (≤1/60s). */
  touch(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  listByUser(userId: string): Promise<Session[]>;
  /** Deleta por id com escopo pelo dono (anti-IDOR). Retorna rowCount. */
  deleteById(id: string, userId: string): Promise<number>;
  deleteAllForUser(userId: string): Promise<void>;
  /** Revoga todas exceto a sessão atual. */
  deleteOthers(userId: string, currentSessionId: string): Promise<void>;
  /** Revoga todas as sessões do device (invariante: ≤1 sessão viva por device). */
  deleteByDevice(deviceId: string): Promise<void>;
  countByUser(userId: string): Promise<number>;
  /** Remove as sessões mais antigas que excedem o cap (mantém `cap` mais novas). */
  deleteOldestOverCap(userId: string, cap: number): Promise<void>;
}

export const SESSION_REPOSITORY: unique symbol = Symbol('SessionRepository');

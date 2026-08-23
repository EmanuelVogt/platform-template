import type { Session } from '../entities/session.entity';

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findByTokenHash(hash: string): Promise<Session | null>;
  /**
   * UPDATE throttled de lastSeenAt/expiresAt: só grava se a sessão não foi
   * vista depois de `touchBefore` (o caller define o intervalo). Chamada
   * concorrente abaixo do intervalo não gera segunda escrita.
   */
  touch(
    id: string,
    lastSeenAt: Date,
    expiresAt: Date,
    touchBefore: Date,
  ): Promise<void>;
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

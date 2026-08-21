export type AuditTrailEntityRef = { table: string; entityId: string }

/**
 * Purga das linhas de um titular na trilha append-only (LGPD), chamada dentro
 * da tx do hard delete. Porta opcional entre dois módulos: o token mora no
 * kernel para que consumidor e provedor se encontrem sem uma aresta de import
 * entre eles.
 *
 * Sem provider a purga vira no-op em vez de erro: se ninguém registra trilha,
 * não existe linha guardando o PII do titular e o purge já está completo.
 * Degradar aqui com 501 tiraria a purga de lixeira inteira de uma instalação
 * mínima, que é válida.
 */
export interface AuditTrailPurger {
  /** Retorna quantas linhas da trilha foram removidas. */
  purgeEntities(refs: readonly AuditTrailEntityRef[]): Promise<number>
}

export const AUDIT_TRAIL_PURGER: unique symbol = Symbol("AuditTrailPurger")

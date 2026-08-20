export type AuditTrailEntityRef = { table: string; entityId: string };

/**
 * Purga da trilha de auditoria das linhas de um titular (LGPD), chamada dentro
 * da tx do hard delete. Porta opcional (AD-021): quem registra o provider é a
 * entrada `audit`, sob o token `AUDIT_TRAIL_PURGER`.
 *
 * Sem provider a purga vira no-op em vez de erro: se `audit` não está instalada
 * não existe trilha guardando o PII do titular, então o purge do usuário já
 * está completo. Degradar aqui com 501 tiraria a purga de lixeira inteira de um
 * filho kernel-only, que é uma instalação válida.
 */
export interface AuditTrailPurger {
  /** Retorna quantas linhas da trilha foram removidas. */
  purgeEntities(refs: readonly AuditTrailEntityRef[]): Promise<number>;
}

export const AUDIT_TRAIL_PURGER: unique symbol = Symbol('AuditTrailPurger');

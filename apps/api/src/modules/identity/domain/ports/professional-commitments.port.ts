/** Compromisso que impede tirar a pessoa do atendimento a hóspede. */
export interface ProfessionalCommitment {
  kind: 'service' | 'collective';
  id: string;
  name: string;
  date: string;
  startMinute: number;
  endMinute: number;
}

/**
 * O que a pessoa ainda tem marcado. Port invertido: o identity não conhece
 * quem sabe responder — o adapter entra pelo slot de `IdentityModule.forRoot`
 * (null object quando o produto não está montado). Ver ADR 0034 e 0082.
 */
export interface ProfessionalCommitments {
  /** Atendimentos e conduções de hoje em diante, ordenados por data e início. */
  listFuture(userId: string): Promise<ProfessionalCommitment[]>;
}

export const PROFESSIONAL_COMMITMENTS: unique symbol = Symbol('ProfessionalCommitments');

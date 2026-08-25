/**
 * Valida as áreas/serviços de atuação de um Profissional. Port invertido e
 * LOCAL da entrada (AD-014): a entrada não conhece quem sabe responder — o
 * adapter entra pelo slot de `ProfessionalModule.forRoot` (null object quando o
 * produto não está montado). Ver ADR 0032.
 */
export interface ProfessionalScope {
  /**
   * Lança `InvalidProfessionalScopeError` se: alguma `areaId` não existe ou está
   * inativa; algum `serviceId` não existe, está inativo, ou pertence a uma área
   * fora de `areaIds`. Sets vazios passam — a obrigatoriedade de ≥1 área é
   * política do use-case, não desta validação estrutural.
   */
  assertValid(
    areaIds: readonly string[],
    serviceIds: readonly string[]
  ): Promise<void>
}

export const PROFESSIONAL_SCOPE: unique symbol = Symbol("ProfessionalScope")

/**
 * Contagem de uso de tags por um consumidor. A central de tags não conhece os
 * domínios que a consomem: cada módulo de produto implementa este reader e o
 * registra no `TagUsageRegistry`.
 */
export interface TagUsageReader {
  /** Quantas entidades vivas do consumidor referenciam cada tag informada. */
  countByTagIds(tagIds: string[]): Promise<ReadonlyMap<string, number>>
}

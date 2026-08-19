import { Inject, Injectable } from "@nestjs/common"

import { TAG_REPOSITORY, type TagRepository } from "../../domain/ports/tag.repository"

export type TagRef = {
  id: string
  name: string
  color: string | null
}

/**
 * Superfície pública da central de tags para os módulos consumidores. Publica
 * fatos do próprio schema e roda na transação do chamador (ADR 0034).
 */
@Injectable()
export class TagDirectoryFacade {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  /** Subconjunto dos ids vivos (fora da lixeira) — validação de vínculo. */
  findLiveTagIds(ids: readonly string[]): Promise<Set<string>> {
    return this.tags.existingLiveIds([...ids])
  }

  /** id → nome/cor das tags vivas — hidratação de views dos consumidores. */
  describeTags(ids: readonly string[]): Promise<Map<string, TagRef>> {
    return this.tags.describeByIds([...ids])
  }
}

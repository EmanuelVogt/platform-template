import { Injectable } from "@nestjs/common"

import type { TagUsageReader } from "../domain/ports/tag-usage.reader"

/**
 * Slot de contagem de uso (base-set não conhece consumidor): módulo de produto
 * registra o próprio reader na raiz de composição. Registro vazio = uso zero.
 */
@Injectable()
export class TagUsageRegistry {
  private readonly readers: TagUsageReader[] = []

  register(reader: TagUsageReader): void {
    this.readers.push(reader)
  }

  async totalsFor(tagIds: string[]): Promise<ReadonlyMap<string, number>> {
    const totals = new Map<string, number>()
    if (tagIds.length === 0 || this.readers.length === 0) return totals

    const perReader = await Promise.all(
      this.readers.map((reader) => reader.countByTagIds(tagIds))
    )
    for (const counts of perReader) {
      for (const [tagId, count] of counts) {
        totals.set(tagId, (totals.get(tagId) ?? 0) + count)
      }
    }
    return totals
  }
}

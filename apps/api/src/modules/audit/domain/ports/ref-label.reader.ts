export type RefTarget = { schema: string; table: string; labelColumn: string }

export interface RefLabelReader {
  /** id → label do alvo; ids inexistentes (hard delete) simplesmente não retornam. */
  findLabels(
    target: RefTarget,
    ids: readonly string[]
  ): Promise<Map<string, string>>
}

export const REF_LABEL_READER: unique symbol = Symbol("RefLabelReader")

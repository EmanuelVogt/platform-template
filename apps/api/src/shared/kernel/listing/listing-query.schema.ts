import { z } from "zod"

/**
 * Booleano de query string. `z.coerce.boolean()` está errado para query (toda
 * string não-vazia é truthy → "false" viraria true), então o booleano de query
 * tem helper próprio: só a string "true" vira true.
 */
export const zBoolQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")

export const baseListingQuerySchema = z.object({
  // Teto de page: sem ele, um OFFSET fundo faz o banco ordenar a tabela inteira
  // por requisição — negação de serviço barata.
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).optional(),
  // Sem default: a direção default é decidida por recurso
  // (config.defaultSort.order em applyListing). Default global anularia a escolha.
  order: z.enum(["asc", "desc"]).optional(),
})

export type BaseListingQuery = z.infer<typeof baseListingQuerySchema> & {
  sort?: string
}

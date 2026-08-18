import { z } from "zod"

/** Envelope de resposta de toda listagem paginada por offset. */
export type PaginatedResult<T> = {
  data: T[]
  page: { total: number; page: number; pageSize: number; totalPages: number }
}

/** Schema Zod do envelope paginado para um item `T` — vira `createZodDto`. */
export function makePaginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.object({
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
}

export function toPaginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  return {
    data,
    // pageSize >= 1 (schema min(1)) → divisão segura. total=0 → totalPages=0
    // (não 1); a UI de Pagination trata o caso vazio.
    page: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  }
}

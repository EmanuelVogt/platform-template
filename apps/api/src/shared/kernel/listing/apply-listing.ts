import {
  and,
  asc,
  desc,
  ilike,
  or,
  type AnyColumn,
  type SQL,
} from "drizzle-orm"

/**
 * Alvo do `q`: coluna (ILIKE) ou expressão `(termo) => SQL` para cross-table
 * (subquery) ou match normalizado. `undefined` descarta o alvo — termo sem
 * dígito não busca CPF. Ver ADR 0030.
 */
export type SearchExpr = (term: string) => SQL | undefined
export type Searchable = AnyColumn | SearchExpr

export type ListingConfig = {
  /** allowlist sortKey → coluna; o enum de `sort` do contrato espelha estas chaves. */
  sortable: Record<string, AnyColumn>
  /** alvos varridos pelo `q` (coluna ILIKE ou expressão custom), combinados em OR. */
  searchable: Searchable[]
  defaultSort: { key: string; order: "asc" | "desc" }
  /**
   * Desempate estável por PK: sem isto, empate na coluna de sort deixa a ordem
   * indefinida entre páginas (offset) → linha duplicada/omitida ao paginar.
   */
  tiebreaker: AnyColumn
}

export type ListingParams = {
  page: number
  pageSize: number
  sort?: string
  order?: "asc" | "desc"
  q?: string
}

/** Cláusulas SQL de uma listagem, prontas para o repositório compor no select. */
export type ListingClauses = {
  where: SQL | undefined
  orderBy: SQL[]
  limit: number
  offset: number
}

/**
 * Escapa metacaracteres LIKE (`%`/`_`/`\`) do termo — não é injeção (o valor é
 * parametrizado pelo Drizzle), mas evita o usuário alterar a semântica do match.
 */
export function escapeLike(term: string): string {
  return term.replace(/[%_\\]/g, (c) => `\\${c}`)
}

/**
 * Monta as cláusulas de listagem (where de filtros + search, orderBy com
 * desempate estável por PK, limit/offset de paginação) a partir dos params
 * validados + config do recurso. É PURA: o repositório roda o select/count na
 * tabela concreta, então as rows saem tipadas sem cast. `filters` são as
 * condições tipadas do recurso, combinadas em AND.
 */
export function buildListingClauses(
  params: ListingParams,
  config: ListingConfig,
  filters: SQL[] = []
): ListingClauses {
  const conds = [...filters]
  if (params.q !== undefined && config.searchable.length > 0) {
    const q = params.q
    const term = `%${escapeLike(q)}%`
    const parts = config.searchable
      .map((target) =>
        typeof target === "function" ? target(q) : ilike(target, term)
      )
      .filter((part): part is SQL => part !== undefined)
    const search = or(...parts)
    if (search !== undefined) conds.push(search)
  }
  const where = conds.length > 0 ? and(...conds) : undefined

  const sortKey = params.sort ?? config.defaultSort.key
  const col =
    config.sortable[sortKey] ?? config.sortable[config.defaultSort.key]
  if (col === undefined) {
    throw new Error(
      `defaultSort.key "${config.defaultSort.key}" não está na allowlist de sortable.`
    )
  }
  const order = params.order ?? config.defaultSort.order
  const dir = order === "asc" ? asc : desc

  return {
    where,
    orderBy: [dir(col), dir(config.tiebreaker)],
    limit: params.pageSize,
    offset: (params.page - 1) * params.pageSize,
  }
}

import { eq } from "drizzle-orm"
import { PgDialect, boolean, pgTable, text, timestamp  } from "drizzle-orm/pg-core"

import {
  buildListingClauses,
  escapeLike,
  type ListingConfig,
} from "./apply-listing"

import type { SQL } from "drizzle-orm"


const dialect = new PgDialect()

/** Converte qualquer fragmento SQL do Drizzle em string legível. */
function toSql(fragment: SQL): string {
  return dialect.sqlToQuery(fragment).sql
}

const t = pgTable("t", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  active: boolean("active").notNull(),
  createdAt: timestamp("created_at").notNull(),
})

const config: ListingConfig = {
  sortable: { name: t.name, createdAt: t.createdAt },
  searchable: [t.name, t.email],
  defaultSort: { key: "createdAt", order: "desc" },
  tiebreaker: t.id,
}

describe("escapeLike", () => {
  it("escapa %, _ e \\ para não alterar a semântica do LIKE", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\")
  })

  it("deixa texto comum intacto", () => {
    expect(escapeLike("ana")).toBe("ana")
  })
})

describe("buildListingClauses — paginação", () => {
  it("limit = pageSize e offset = (page - 1) * pageSize", () => {
    const clauses = buildListingClauses({ page: 3, pageSize: 20 }, config)
    expect(clauses.limit).toBe(20)
    expect(clauses.offset).toBe(40)
  })

  it("page 1 → offset 0", () => {
    const clauses = buildListingClauses({ page: 1, pageSize: 10 }, config)
    expect(clauses.offset).toBe(0)
  })
})

describe("buildListingClauses — ordenação", () => {
  it("orderBy tem 2 entradas: coluna de sort + desempate por PK", () => {
    const clauses = buildListingClauses({ page: 1, pageSize: 20 }, config)
    expect(clauses.orderBy).toHaveLength(2)
  })

  it("ordem padrão é 'created_at desc' com desempate 'id desc'", () => {
    const clauses = buildListingClauses({ page: 1, pageSize: 20 }, config)
    expect(toSql(clauses.orderBy[0]!)).toContain('"created_at" desc')
    expect(toSql(clauses.orderBy[1]!)).toContain('"id" desc')
  })

  it("sort=name order=asc → 'name asc' com desempate 'id asc'", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, sort: "name", order: "asc" },
      config
    )
    expect(toSql(clauses.orderBy[0]!)).toContain('"name" asc')
    expect(toSql(clauses.orderBy[1]!)).toContain('"id" asc')
  })

  it("sort=name order=desc → 'name desc'", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, sort: "name", order: "desc" },
      config
    )
    expect(toSql(clauses.orderBy[0]!)).toContain('"name" desc')
  })

  it("sort inválido cai no sort padrão (createdAt)", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, sort: "nao_existe" },
      config
    )
    expect(toSql(clauses.orderBy[0]!)).toContain('"created_at"')
  })
})

describe("buildListingClauses — where", () => {
  it("sem filtros nem busca: where indefinido (sem WHERE)", () => {
    const clauses = buildListingClauses({ page: 1, pageSize: 20 }, config)
    expect(clauses.where).toBeUndefined()
  })

  it("com q: where contém ILIKE sobre a coluna 'name'", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      config
    )
    expect(clauses.where).toBeDefined()
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"name" ilike')
  })

  it("com q: where contém ILIKE sobre a coluna 'email'", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      config
    )
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"email" ilike')
  })

  it("com q: where NÃO referencia coluna fora das searchable (ex: active)", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      config
    )
    const sql = toSql(clauses.where!)
    expect(sql).not.toContain('"active"')
  })

  it("busca inclui o termo escapado como parâmetro %<termo>%", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      config
    )
    const { params } = dialect.sqlToQuery(clauses.where!)
    expect(params).toContain("%ana%")
  })

  it("termos diferentes geram parâmetros diferentes no WHERE", () => {
    const clausesA = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      config
    )
    const clausesB = buildListingClauses(
      { page: 1, pageSize: 20, q: "roberto" },
      config
    )
    const paramsA = dialect.sqlToQuery(clausesA.where!).params
    const paramsB = dialect.sqlToQuery(clausesB.where!).params
    expect(paramsA).not.toEqual(paramsB)
  })

  it("metacaracteres LIKE no q são escapados no parâmetro", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "50%off" },
      config
    )
    const { params } = dialect.sqlToQuery(clauses.where!)
    expect(params).toContain("%50\\%off%")
    expect(params).not.toContain("%50%off%")
  })

  it("com filtros tipados: where definido e contém a condição do filtro", () => {
    const clauses = buildListingClauses({ page: 1, pageSize: 20 }, config, [
      eq(t.active, true),
    ])
    expect(clauses.where).toBeDefined()
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"active"')
  })

  it("filtro + busca: where combina ambas as condições via AND", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      config,
      [eq(t.active, true)]
    )
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"active"')
    expect(sql).toContain('"name" ilike')
    expect(sql).toContain('"email" ilike')
    expect(sql).toContain(" and ")
  })
})

describe("buildListingClauses — config com uma única coluna searchable", () => {
  const singleSearchConfig: ListingConfig = {
    sortable: { name: t.name },
    searchable: [t.name],
    defaultSort: { key: "name", order: "asc" },
    tiebreaker: t.id,
  }

  it("where referencia apenas a coluna configurada, não email", () => {
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      singleSearchConfig
    )
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"name" ilike')
    expect(sql).not.toContain('"email"')
  })
})

describe("buildListingClauses — searchable com expressão custom", () => {
  it("alvo função injeta seu predicado no OR junto das colunas", () => {
    const cfg: ListingConfig = {
      ...config,
      searchable: [t.name, (term) => eq(t.email, term)],
    }
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "x@y.com" },
      cfg
    )
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"name" ilike')
    expect(sql).toContain('"email" =')
  })

  it("coluna recebe termo escapado/wrapped; função recebe o termo cru", () => {
    const cfg: ListingConfig = {
      ...config,
      searchable: [t.name, (term) => eq(t.email, term)],
    }
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      cfg
    )
    const { params } = dialect.sqlToQuery(clauses.where!)
    expect(params).toContain("%ana%")
    expect(params).toContain("ana")
  })

  it("função que retorna undefined é descartada do OR", () => {
    const cfg: ListingConfig = {
      ...config,
      searchable: [t.name, () => undefined],
    }
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      cfg
    )
    const sql = toSql(clauses.where!)
    expect(sql).toContain('"name" ilike')
    expect(sql).not.toContain('"email"')
  })

  it("todos os alvos undefined → q não gera WHERE", () => {
    const cfg: ListingConfig = {
      ...config,
      searchable: [() => undefined],
    }
    const clauses = buildListingClauses(
      { page: 1, pageSize: 20, q: "ana" },
      cfg
    )
    expect(clauses.where).toBeUndefined()
  })
})

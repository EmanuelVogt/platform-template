import { PgDialect, pgTable, timestamp } from "drizzle-orm/pg-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { appTimeZone, bucketOf, resolveTimeZone } from "./bucket-sql"

const t = pgTable("sample", { at: timestamp("at") })
const dialect = new PgDialect()

function render(unit: "day" | "week"): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(bucketOf(t.at, unit))
  return { sql: query.sql, params: query.params }
}

describe("appTimeZone", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Primeiro teste do arquivo de propósito: o aviso é memoizado por processo, e
  // é ele — não o valor — que só pode ser observado antes da primeira chamada.
  it("cai em UTC sem APP_TIMEZONE e avisa uma única vez no processo", () => {
    const first = vi.fn()
    const second = vi.fn()

    expect(appTimeZone(first)).toBe("UTC")
    expect(appTimeZone(second)).toBe("UTC")

    expect(first).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith("UTC")
    expect(second).not.toHaveBeenCalled()
  })

  it("relê APP_TIMEZONE a cada chamada, sem memoizar o valor", () => {
    vi.stubEnv("APP_TIMEZONE", "America/Sao_Paulo")
    expect(appTimeZone(vi.fn())).toBe("America/Sao_Paulo")

    vi.unstubAllEnvs()
    expect(appTimeZone(vi.fn())).toBe("UTC")
  })
})

describe("resolveTimeZone", () => {
  it("devolve o fuso IANA configurado", () => {
    const onFallback = vi.fn()

    expect(resolveTimeZone("America/Sao_Paulo", onFallback)).toBe(
      "America/Sao_Paulo"
    )
    expect(onFallback).not.toHaveBeenCalled()
  })

  it("recusa fuso fora do conjunto conhecido pelo runtime", () => {
    expect(() => resolveTimeZone("Mars/Olympus", vi.fn())).toThrow(
      /APP_TIMEZONE não é um fuso IANA conhecido/
    )
  })

  it("recusa texto que tentaria fechar o literal SQL", () => {
    expect(() =>
      resolveTimeZone("UTC'; DROP TABLE users; --", vi.fn())
    ).toThrow(/APP_TIMEZONE não é um fuso IANA conhecido/)
  })
})

describe("bucketOf", () => {
  it("aplica o fuso resolvido como literal, sem bind", () => {
    const day = render("day")

    expect(day.sql).toContain("AT TIME ZONE 'UTC'")
    expect(day.sql).toContain("date_trunc('day'")
    expect(day.params).toEqual([])
  })

  it("distingue o bucket diário do semanal", () => {
    expect(render("week").sql).toContain("date_trunc('week'")
    expect(render("week").sql).not.toEqual(render("day").sql)
  })
})

import { z } from "zod"

import { makePaginatedSchema, toPaginated } from "./paginated"
import { describe, expect, it } from "vitest"

describe("toPaginated", () => {
  it("calcula totalPages com ceil", () => {
    expect(toPaginated([], 21, 1, 20).page.totalPages).toBe(2)
  })

  it("total=0 vira totalPages=0 (não 1)", () => {
    expect(toPaginated([], 0, 1, 20).page).toEqual({
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    })
  })

  it("embrulha data e os metadados de página", () => {
    const result = toPaginated([{ id: "a" }], 1, 2, 20)
    expect(result.data).toEqual([{ id: "a" }])
    expect(result.page).toEqual({
      total: 1,
      page: 2,
      pageSize: 20,
      totalPages: 1,
    })
  })
})

describe("makePaginatedSchema", () => {
  const schema = makePaginatedSchema(z.object({ id: z.string() }))

  it("valida o envelope { data, page }", () => {
    const result = schema.safeParse({
      data: [{ id: "a" }],
      page: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
    expect(result.success).toBe(true)
  })

  it("rejeita item de data fora do shape", () => {
    const result = schema.safeParse({
      data: [{ id: 1 }],
      page: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
    expect(result.success).toBe(false)
  })
})

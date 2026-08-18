import { baseListingQuerySchema, zBoolQuery } from "./listing-query.schema"

describe("zBoolQuery", () => {
  it('"false" vira false (z.coerce.boolean estaria errado aqui)', () => {
    expect(zBoolQuery.parse("false")).toBe(false)
  })

  it('"true" vira true', () => {
    expect(zBoolQuery.parse("true")).toBe(true)
  })

  it("rejeita valor fora do enum", () => {
    expect(zBoolQuery.safeParse("1").success).toBe(false)
  })
})

describe("baseListingQuerySchema", () => {
  it("aplica defaults page=1 e pageSize=20", () => {
    expect(baseListingQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
    })
  })

  it("coage strings de query para number", () => {
    expect(
      baseListingQuerySchema.parse({ page: "3", pageSize: "50" })
    ).toMatchObject({
      page: 3,
      pageSize: 50,
    })
  })

  it("rejeita pageSize acima de 100 (anti scan/payload abusivo)", () => {
    expect(baseListingQuerySchema.safeParse({ pageSize: "999" }).success).toBe(
      false
    )
  })

  it("rejeita page abaixo de 1", () => {
    expect(baseListingQuerySchema.safeParse({ page: "0" }).success).toBe(false)
  })

  it("order é opcional, sem default (direção é por recurso)", () => {
    expect(baseListingQuerySchema.parse({}).order).toBeUndefined()
  })
})

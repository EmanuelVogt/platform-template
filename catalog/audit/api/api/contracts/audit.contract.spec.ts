import { describe, expect, it } from "vitest"

import { listAuditEntriesQuerySchema } from "./audit.contract"

describe("listAuditEntriesQuerySchema", () => {
  it("aceita from/to em ISO datetime válido", () => {
    const result = listAuditEntriesQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.999Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejeita from com mês inválido (2026-13-01)", () => {
    expect(
      listAuditEntriesQuerySchema.safeParse({
        from: "2026-13-01T00:00:00.000Z",
      }).success
    ).toBe(false)
  })

  it("rejeita from/to como data sem horário", () => {
    expect(
      listAuditEntriesQuerySchema.safeParse({ from: "2026-01-01" }).success
    ).toBe(false)
    expect(
      listAuditEntriesQuerySchema.safeParse({ to: "2026-01-01" }).success
    ).toBe(false)
  })

  it("txId no teto (Number.MAX_SAFE_INTEGER) passa", () => {
    expect(
      listAuditEntriesQuerySchema.safeParse({ txId: Number.MAX_SAFE_INTEGER })
        .success
    ).toBe(true)
  })

  it("txId acima do teto é rejeitado", () => {
    expect(
      listAuditEntriesQuerySchema.safeParse({
        txId: Number.MAX_SAFE_INTEGER + 1,
      }).success
    ).toBe(false)
  })
})

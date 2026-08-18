import {
  AGGREGATE_SATELLITES,
  TECHNICAL_TABLES,
  tablesForAggregate,
} from "./aggregate-registry"
import { AUDITED } from "./audit-coverage"

describe("aggregate-registry", () => {
  const auditedBare = [...AUDITED].map((t) => t.split(".")[1])

  it("toda tabela auditada aparece exatamente uma vez (raiz, satélite ou técnica)", () => {
    const declared = [
      ...Object.keys(AGGREGATE_SATELLITES),
      ...Object.values(AGGREGATE_SATELLITES).flat(),
      ...TECHNICAL_TABLES,
    ]
    expect([...declared].sort()).toEqual([...auditedBare].sort())
    expect(new Set(declared).size).toBe(declared.length)
  })

  it("tablesForAggregate expande raiz para raiz+satélites", () => {
    expect(tablesForAggregate("permission_templates")).toEqual([
      "permission_templates",
      "permission_template_permissions",
    ])
  })

  it("tabela fora do registry volta só ela mesma", () => {
    expect(tablesForAggregate("sessions")).toEqual(["sessions"])
  })
})

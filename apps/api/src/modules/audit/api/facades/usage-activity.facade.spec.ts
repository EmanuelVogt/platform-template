import { UsageActivityFacade } from "./usage-activity.facade"

import type {
  ActivityStatsReader,
  TableActivityRow,
} from "../../domain/ports/activity-stats.reader"

const bucket = new Date("2026-03-05T03:00:00Z")

function facadeReading(rows: TableActivityRow[]): UsageActivityFacade {
  const reader: ActivityStatsReader = {
    countByTableAndBucket: () => Promise.resolve(rows),
  }
  return new UsageActivityFacade(reader)
}

const window = {
  from: new Date("2026-03-01T03:00:00Z"),
  to: new Date("2026-03-11T03:00:00Z"),
  unit: "day" as const,
}

describe("UsageActivityFacade", () => {
  it("traduz a tabela alterada no assunto do sistema", async () => {
    const facade = facadeReading([
      { tableName: "tags", bucket, count: 3 },
    ])

    expect(await facade.countActivityByArea(window)).toEqual([
      {
        areaKey: "admin.tags",
        areaLabel: "Tags",
        bucket,
        count: 3,
      },
    ])
  })

  it("tabela sem assunto mapeado sai como Outros, sem perder a contagem", async () => {
    const facade = facadeReading([
      { tableName: "tabela_desconhecida", bucket, count: 9 },
    ])

    expect(await facade.countActivityByArea(window)).toEqual([
      { areaKey: "other", areaLabel: "Outros", bucket, count: 9 },
    ])
  })

  it("não vaza nome de tabela para fora do módulo", async () => {
    const facade = facadeReading([
      { tableName: "tags", bucket, count: 1 },
    ])

    const rows = await facade.countActivityByArea(window)

    expect(Object.keys(rows[0] ?? {})).toEqual([
      "areaKey",
      "areaLabel",
      "bucket",
      "count",
    ])
  })
})

import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { professionalDefaultHours } from "../infrastructure/tables/professional-default-hours.table"
import { professionalProfile } from "../infrastructure/tables/professional-profile.table"
import { userProfessionalAreas } from "../infrastructure/tables/user-professional-area.table"
import { userProfessionalScheduleConfigs } from "../infrastructure/tables/user-professional-schedule-config.table"
import { userProfessionalServices } from "../infrastructure/tables/user-professional-service.table"
import { userSchedulingAreas } from "../infrastructure/tables/user-scheduling-area.table"

// SPEC_DEVIATION: a entrada não ganha `contract.snapshot.json` como as irmãs.
// Reason: ela é só fachada — zero rota HTTP — e um snapshot de operações vazio
// passaria sob qualquer implementação errada. A paridade que existe para fixar
// é a das colunas que saíram de `identity.users` no corte do agregado.
describe("paridade do recorte profissional extraído do identity (AD-035)", () => {
  it("recebe serves_clients e birth_date, que saíram de identity.users", () => {
    const { name, schema, columns } = getTableConfig(professionalProfile)

    expect(schema).toBe("professional")
    expect(name).toBe("professional_profile")

    const servesClients = columns.find((c) => c.name === "serves_clients")
    expect(servesClients?.notNull).toBe(true)
    expect(servesClients?.default).toBe(false)

    expect(columns.find((c) => c.name === "birth_date")?.notNull).toBe(false)
  })

  it("liga o perfil ao usuário por user_id como chave primária", () => {
    const { columns } = getTableConfig(professionalProfile)
    const userId = columns.find((column) => column.name === "user_id")

    expect(userId?.primary).toBe(true)
    expect(userId?.notNull).toBe(true)
  })

  it("mantém no schema professional as tabelas que module.json exporta", () => {
    const tables = [
      professionalProfile,
      userProfessionalAreas,
      userProfessionalServices,
      userSchedulingAreas,
      userProfessionalScheduleConfigs,
      professionalDefaultHours,
    ].map((table) => getTableConfig(table))

    expect(tables.map((table) => table.schema)).toEqual(
      Array.from({ length: tables.length }, () => "professional")
    )
    expect(tables.map((table) => table.name)).toEqual([
      "professional_profile",
      "user_professional_areas",
      "user_professional_services",
      "user_scheduling_areas",
      "user_professional_schedule_configs",
      "professional_default_hours",
    ])
  })
})

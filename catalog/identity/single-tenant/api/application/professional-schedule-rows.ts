/**
 * Formato das linhas das duas tabelas de agenda do profissional (pg schema
 * `identity`), espelhado à mão porque `application` não pode importar
 * `infrastructure/tables` (module-boundaries.spec.ts) — só os tipos, sem os
 * objetos de tabela do Drizzle, atravessam essa borda.
 */
export type ProfessionalDefaultHoursRow = {
  id: string
  type: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
  createdAt: Date
}

export type UserProfessionalScheduleConfigRow = {
  userId: string
  isExtra: boolean
  createdAt: Date
  updatedAt: Date
}

export type UserProfessionalScheduleConfigSlotRow = {
  id: string
  userId: string
  type: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
  createdAt: Date
}

export type UserProfessionalScheduleConfigBlockRow = {
  id: string
  userId: string
  startDate: string
  endDate: string
  startMinute: number | null
  endMinute: number | null
  reason: string | null
  weekdays: number
  createdAt: Date
}

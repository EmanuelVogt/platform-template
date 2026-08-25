/**
 * Superfície pública das tabelas de agenda do profissional (pg schema
 * `professional`, com FK para `identity.users`). Só o formato das linhas
 * atravessa aqui — `api/facades` não pode importar `infrastructure/tables`
 * (module-boundaries.spec.ts); os objetos de tabela do Drizzle continuam em
 * `infrastructure/tables/`.
 */
export type {
  ProfessionalDefaultHoursRow,
  UserProfessionalScheduleConfigBlockRow,
  UserProfessionalScheduleConfigRow,
  UserProfessionalScheduleConfigSlotRow,
} from "../../application/professional-schedule-rows"

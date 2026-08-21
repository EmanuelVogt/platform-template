/**
 * Superfície pública das duas tabelas de agenda do profissional (pg schema
 * `identity`, uma delas com FK para `identity.users`). Só o formato das linhas
 * atravessa aqui — `api/facades` não pode importar `infrastructure/tables`
 * (module-boundaries.spec.ts); os objetos de tabela do Drizzle continuam em
 * `infrastructure/tables/`, prontos para um repositório dedicado quando o
 * módulo `professional` (dono do slice) tiver as queries definidas.
 * Ver design C-PROF (opção b).
 */
export type {
  ProfessionalDefaultHoursRow,
  UserProfessionalScheduleConfigBlockRow,
  UserProfessionalScheduleConfigRow,
  UserProfessionalScheduleConfigSlotRow,
} from "../../application/professional-schedule-rows"

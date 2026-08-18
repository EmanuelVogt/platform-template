/**
 * Superfície pública das duas tabelas de agenda do profissional. Elas moram no
 * pg schema `identity` e uma delas tem FK para `identity.users`, então não podem
 * migrar de módulo sem migration; o módulo `professional`, dono do slice, lê o
 * schema por aqui em vez de fazer deep import em `infrastructure/tables/`.
 * Ver design C-PROF (opção b).
 */
export {
  professionalDefaultHours,
} from "../../infrastructure/tables/professional-default-hours.table"
export {
  userProfessionalScheduleConfigBlocks,
  userProfessionalScheduleConfigs,
  userProfessionalScheduleConfigSlots,
} from "../../infrastructure/tables/user-professional-schedule-config.table"

export type { ProfessionalDefaultHoursRow } from "../../infrastructure/tables/professional-default-hours.table"
export type {
  UserProfessionalScheduleConfigBlockRow,
  UserProfessionalScheduleConfigRow,
  UserProfessionalScheduleConfigSlotRow,
} from "../../infrastructure/tables/user-professional-schedule-config.table"

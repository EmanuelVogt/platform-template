import type { AssignableAccessProfile } from "../../../../../shared/kernel/access/permission.types"
import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

export type CreateUserInput = {
  name: string
  email: string
  accessProfile: AssignableAccessProfile
  attendsGuests: boolean
  permissions: PermissionKey[]
  // Quem atende hóspede: áreas de atuação e o subconjunto de serviços. Vazios para os demais.
  areaIds: string[]
  serviceIds: string[]
  // Perfil Agendamentos: áreas em que o usuário pode agendar. Vazio nos demais.
  schedulingAreaIds: string[]
}

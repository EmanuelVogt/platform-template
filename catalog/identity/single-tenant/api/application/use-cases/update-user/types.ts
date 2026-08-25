import type { AssignableAccessProfile } from "../../../domain/access/permission.types"
import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

export type UpdateUserInput = {
  userId: string
  name: string
  accessProfile: AssignableAccessProfile
  permissions: PermissionKey[]
  // Quem atende cliente: áreas de atuação e o subconjunto de serviços. Vazios para os demais.
  areaIds: string[]
  serviceIds: string[]
  // Perfil Agendamentos: áreas em que o usuário pode agendar. Vazio nos demais.
  schedulingAreaIds: string[]
}

import type { AccessProfile } from "../domain/access/permission.types"
import type { AuthEvent, AuthEventType } from "../domain/entities/auth-event.entity"
import type { User, UserStatus } from "../domain/entities/user.entity"
import type { PermissionKey } from "../domain/permissions/permission-catalog"
import type { DeviceWithActivity } from "../domain/ports/device.repository"
import type { UserListRow } from "../domain/ports/user.repository"

/** Projeção do usuário exposta pela API (sem campos sensíveis). */
export type UserView = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  pendingEmail: string | null
  accessProfile: AccessProfile
  permissions: readonly PermissionKey[]
  avatarAttachmentId: string | null
  birthDate: string | null
}

/** Item de uma listagem de usuários (admin). `createdAt` serializado em ISO. */
export type UserListItemView = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  accessProfile: AccessProfile
  servesClients: boolean
  permissions: readonly PermissionKey[]
  // Áreas/serviços de atuação (quem atende cliente). Vazios para os demais.
  areaIds: readonly string[]
  serviceIds: readonly string[]
  // Áreas de agendamento (perfil Agendamentos). Vazias para os demais.
  schedulingAreaIds: readonly string[]
  avatarAttachmentId: string | null
  createdAt: string
  status: UserStatus
  accessLinkExpiresAt: string | null
  accessLinkExpired: boolean
  deletedAt: string | null
}

export function toUserView(
  user: User,
  permissions: readonly PermissionKey[]
): UserView {
  return {
    id: user.props.id,
    name: user.props.name,
    email: user.props.email,
    emailVerified: user.props.emailVerified,
    pendingEmail: user.props.pendingEmail,
    accessProfile: user.props.accessProfile,
    permissions,
    avatarAttachmentId: user.props.avatarAttachmentId,
    birthDate: user.props.birthDate,
  }
}

export function toUserListItemView(row: UserListRow): UserListItemView {
  const { props } = row.user
  return {
    id: props.id,
    name: props.name,
    email: props.email,
    emailVerified: props.emailVerified,
    accessProfile: props.accessProfile,
    servesClients: props.servesClients,
    permissions: row.permissions,
    areaIds: row.areaIds,
    serviceIds: row.serviceIds,
    schedulingAreaIds: row.schedulingAreaIds,
    avatarAttachmentId: props.avatarAttachmentId,
    createdAt: props.createdAt.toISOString(),
    status: props.status,
    accessLinkExpiresAt: row.accessLinkExpiresAt ? row.accessLinkExpiresAt.toISOString() : null,
    accessLinkExpired: row.accessLinkExpired,
    deletedAt: props.deletedAt ? props.deletedAt.toISOString() : null,
  }
}

export type AccessHistoryItemView = {
  id: string
  eventType: AuthEventType
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

/** LGPD: NUNCA expor emailHash/correlationId/traceId/metadata no histórico. */
export function toAccessHistoryItemView(event: AuthEvent): AccessHistoryItemView {
  const p = event.props
  return {
    id: p.id,
    eventType: p.eventType,
    ipAddress: p.ip,
    userAgent: p.userAgent,
    createdAt: p.createdAt.toISOString(),
  }
}

export type DeviceView = {
  id: string
  ipAddress: string | null
  userAgent: string | null
  firstSeenAt: string
  lastSeenAt: string
  activeSessionCount: number
  current: boolean
}

export function toDeviceView(d: DeviceWithActivity, current: boolean): DeviceView {
  return {
    id: d.id,
    ipAddress: d.ipAddress,
    userAgent: d.userAgent,
    firstSeenAt: d.firstSeenAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
    activeSessionCount: d.activeSessionCount,
    current,
  }
}

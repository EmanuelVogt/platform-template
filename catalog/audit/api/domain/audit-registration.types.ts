import type { PermissionKey } from "../../../shared/kernel/access/access-policy.port"

export type AuditedTableRegistration = {
  schema: string
  table: string
  owner: PermissionKey
  aggregateRoot?: string
  technical?: boolean
}

export type RefTargetRegistration = {
  column: string
  schema: string
  table: string
  labelColumn: string
}

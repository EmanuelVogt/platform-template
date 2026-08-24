import { Injectable } from "@nestjs/common"

import {
  featureOf,
  isPermissionKey,
  moduleOf,
} from "../../../identity/api/facades/permission-catalog.facade"

import { AuditRegistry } from "./audit-registry"

export type ActivityArea = { key: string; label: string }

/** Tabela única de mensagens do entry audit — hoje reproduz a string anterior. */
const AUDIT_MESSAGES = { unmappedAreaLabel: "Outros" } as const

/** Assunto do sistema exibido quando a tabela alterada não tem dono no registry. */
export const UNMAPPED_AREA: ActivityArea = {
  key: "other",
  label: AUDIT_MESSAGES.unmappedAreaLabel,
}

/** Resolve o assunto do sistema (feature) dono de uma tabela auditada, para o
 *  painel de uso (issue #36). */
@Injectable()
export class ActivityAreaResolver {
  constructor(private readonly registry: AuditRegistry) {}

  activityAreaOf(tableName: string): ActivityArea {
    const owner = this.registry.ownerOf(tableName)
    if (owner === undefined || !isPermissionKey(owner)) return UNMAPPED_AREA
    const feature = featureOf(owner)
    return { key: `${moduleOf(owner)}.${feature.key}`, label: feature.label }
  }
}

import { Injectable } from "@nestjs/common"

import {
  featureOf,
  moduleOf,
} from "../../../identity/api/facades/permission-catalog.facade"

import { AuditRegistry } from "./audit-registry"

export type ActivityArea = { key: string; label: string }

/** Assunto do sistema exibido quando a tabela alterada não tem dono no registry. */
export const UNMAPPED_AREA: ActivityArea = { key: "other", label: "Outros" }

/** Resolve o assunto do sistema (feature) dono de uma tabela auditada, para o
 *  painel de uso (issue #36). */
@Injectable()
export class ActivityAreaResolver {
  constructor(private readonly registry: AuditRegistry) {}

  activityAreaOf(tableName: string): ActivityArea {
    const owner = this.registry.ownerOf(tableName)
    if (owner === undefined) return UNMAPPED_AREA
    const feature = featureOf(owner)
    return { key: `${moduleOf(owner)}.${feature.key}`, label: feature.label }
  }
}

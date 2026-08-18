import {
  featureOf,
  moduleOf,
} from "../../identity/api/facades/permission-catalog.facade"
import { auditOwnerOf } from "../domain/table-owners"

export type ActivityArea = { key: string; label: string }

/** Assunto do sistema exibido quando a tabela alterada não tem dono no mapa. */
export const UNMAPPED_AREA: ActivityArea = { key: "other", label: "Outros" }

/** Assunto do sistema a que a tabela pertence — a feature dona da chave
 *  "Ver logs" daquela tabela, cujo label já é o texto pt-BR de tela. */
export function activityAreaOf(tableName: string): ActivityArea {
  const owner = auditOwnerOf(tableName)
  if (owner === undefined) return UNMAPPED_AREA
  const feature = featureOf(owner)
  return { key: `${moduleOf(owner)}.${feature.key}`, label: feature.label }
}

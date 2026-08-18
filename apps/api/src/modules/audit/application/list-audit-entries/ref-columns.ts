import type { RefTarget } from "../../domain/ports/ref-label.reader"

const USERS: RefTarget = { schema: "identity", table: "users", labelColumn: "name" }

/** Colunas cujo valor é FK exibível — resolvidas para o nome do alvo. */
const BY_COLUMN: Record<string, RefTarget> = {
  user_id: USERS,
  professional_user_id: USERS,
  template_id: {
    schema: "identity",
    table: "permission_templates",
    labelColumn: "name",
  },
}

export function refTargetFor(column: string): RefTarget | undefined {
  return BY_COLUMN[column]
}

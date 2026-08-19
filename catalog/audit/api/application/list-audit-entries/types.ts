import type { ListAuditEntriesInput } from "../../domain/ports/audit.repository"

/** Query da API: `table` é a RAIZ do agregado; o use case expande p/ `tables`. */
export type ListAuditEntriesQuery = Omit<ListAuditEntriesInput, "tables"> & {
  table?: string
}

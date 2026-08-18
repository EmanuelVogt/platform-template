import { eq, isNull, type SQL } from "drizzle-orm"

import { users } from "./tables/user.table"

import type { ListingConfig } from "../../../shared/kernel/listing/apply-listing"
import type { AssignableProfessionalRow } from "../domain/ports/user.repository"

export const ASSIGNABLE_LISTING_CONFIG: ListingConfig = {
  sortable: { name: users.name },
  searchable: [users.name, users.email],
  defaultSort: { key: "name", order: "asc" },
  tiebreaker: users.id,
}

/** Profissional atribuível: atende cliente, ativo e não soft-deletado. O perfil
 *  de acesso não entra — agendista e recepção também atendem (ADR 0082). */
export function assignableProfessionalFilters(): SQL[] {
  return [
    eq(users.servesClients, true),
    eq(users.status, "active"),
    isNull(users.deletedAt),
  ]
}

export const assignableProfessionalSelection = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarAttachmentId: users.avatarAttachmentId,
}

export function toAssignableProfessionalRow(r: {
  id: string
  name: string
  email: string
  avatarAttachmentId: string | null
}): AssignableProfessionalRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    avatarAttachmentId: r.avatarAttachmentId ?? null,
  }
}

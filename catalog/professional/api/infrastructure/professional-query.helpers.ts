import { eq, isNull, type SQL } from "drizzle-orm"

import { users } from "../../identity/infrastructure/tables/user.table"

import { professionalProfile } from "./tables/professional-profile.table"

import type { ListingConfig } from "../../../shared/kernel/listing/apply-listing"
import type { AssignableProfessionalRow } from "../domain/ports/professional-assignment.repository"

export const ASSIGNABLE_LISTING_CONFIG: ListingConfig = {
  sortable: { name: users.name },
  searchable: [users.name, users.email],
  defaultSort: { key: "name", order: "asc" },
  tiebreaker: users.id,
}

/** Profissional atribuível: atende cliente, ativo e não soft-deletado. O perfil
 *  de acesso não entra — agendista e recepção também atendem (ADR 0082).
 *
 *  `serves_clients` deixou de ser coluna de `identity.users` no corte do
 *  agregado (AD-035): quem consulta estes filtros precisa juntar
 *  `professional.professional_profile` — ver `assignableProfessionalJoin`. */
export function assignableProfessionalFilters(): SQL[] {
  return [
    eq(professionalProfile.servesClients, true),
    eq(users.status, "active"),
    isNull(users.deletedAt),
  ]
}

/** Condição do join 1:1 que traz `serves_clients` para junto do usuário. */
export function assignableProfessionalJoin(): SQL {
  return eq(professionalProfile.userId, users.id)
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

import { and, eq, inArray, type SQL } from "drizzle-orm"

import { professionalProfile } from "./tables/professional-profile.table"

import type { DrizzleExecutor } from "../../../shared/infra/database/drizzle.provider"
import type { UserDirectoryRow } from "../../identity/api/facades/user-directory.facade"
import type { AssignableProfessionalRow } from "../domain/ports/professional-assignment.repository"

/**
 * Recorte que é DESTA entrada: quem tem perfil profissional que atende cliente.
 * `serves_clients` deixou de ser coluna de `identity.users` no corte do agregado
 * (AD-035) e mora em `professional.professional_profile`. O perfil de acesso não
 * entra — agendista e recepção também atendem (ADR 0082).
 *
 * Estado de CONTA (`active`, soft delete) não é recorte daqui: quem responde por
 * ele é o identity, pela `UserDirectoryFacade`. A entrada mantém a FK física
 * para `identity.users` (integridade referencial no schema), mas nenhuma
 * LEITURA daqui seleciona colunas de lá.
 */
export function servesClientsFilter(): SQL {
  return eq(professionalProfile.servesClients, true)
}

/**
 * Ids dos candidatos a profissional atribuível, opcionalmente restritos a um
 * conjunto. `restrictTo` vazio devolve vazio — é um recorte válido, não "todos".
 */
export async function servesClientsUserIds(
  db: DrizzleExecutor,
  restrictTo?: readonly string[]
): Promise<string[]> {
  if (restrictTo !== undefined && restrictTo.length === 0) return []
  const rows = await db
    .select({ userId: professionalProfile.userId })
    .from(professionalProfile)
    .where(
      restrictTo === undefined
        ? servesClientsFilter()
        : and(
            servesClientsFilter(),
            inArray(professionalProfile.userId, [...restrictTo])
          )
    )
  return rows.map((row) => row.userId)
}

/** Projeção de diretório do identity → linha pública da entrada. */
export function toAssignableProfessionalRow(
  row: UserDirectoryRow
): AssignableProfessionalRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarAttachmentId: row.avatarAttachmentId ?? null,
  }
}

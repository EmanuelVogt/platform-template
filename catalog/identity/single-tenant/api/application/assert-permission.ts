import { getExtension } from "../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import { IDENTITY_ACCESS } from "./identity-context"

import type { PermissionKey } from "../domain/permissions/permission-catalog"

/**
 * Exige a permissão dentro do use case, para o que o `@RequirePermission` não
 * expressa — permissão condicionada a um filtro (`?deleted=true`), por
 * exemplo. Lê o mesmo `IDENTITY_ACCESS` que o AccessGuard publica, com a mesma
 * isenção de master.
 *
 * Sem contexto de acesso (chamada fora de request, ou usuário excluído, que o
 * AuthMiddleware não publica) NEGA: silêncio aqui leria como autorizado.
 */
export function assertPermission(key: PermissionKey): void {
  const access = getExtension(IDENTITY_ACCESS)
  if (access === undefined) throw new ForbiddenError()
  if (access.isMaster) return
  if (!access.permissions.has(key)) throw new ForbiddenError()
}

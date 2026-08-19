import type { PermissionKey } from "../../../shared/kernel/access/access-policy.port"
import type { ExtensionKey } from "../../../shared/kernel/context/request-context"

/** Permissões do ator, resolvidas uma vez por request pelo AuthMiddleware. */
export type IdentityAccess = {
  permissions: ReadonlySet<PermissionKey>
  isMaster: boolean
}

export const IDENTITY_ACCESS: ExtensionKey<IdentityAccess> =
  Symbol("identity.access")

/** Sessão do request — `sessionId`/`deviceId` não cabem no `Actor` do kernel. */
export type IdentitySession = {
  sessionId: string
  deviceId: string | null
}

export const IDENTITY_SESSION: ExtensionKey<IdentitySession> =
  Symbol("identity.session")

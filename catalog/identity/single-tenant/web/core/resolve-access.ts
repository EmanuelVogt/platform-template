import { can } from "./permissions"

import type { RouteAccess } from "./route-access"
import type { CurrentUser } from "./session.types"

/** `anon` = mande para o login guardando a intenção; `forbidden` = está logado
 *  mas não pode ver a rota; `allow` = siga. */
export type AccessDecision = "allow" | "anon" | "forbidden"

export function resolveAccess(
  user: CurrentUser | null,
  access: RouteAccess
): AccessDecision {
  if (access.kind === "public") return "allow"
  if (!user) return "anon"
  if (access.kind === "authenticated") return "allow"
  return can(user, access.key) ? "allow" : "forbidden"
}

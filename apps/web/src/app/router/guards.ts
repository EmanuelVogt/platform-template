import { redirect } from "@tanstack/react-router"

import { sessionQueryOptions } from "@/entities/session/api/session.options"
import { can } from "@/entities/session/model/permissions"
import type { RouteAccess } from "@/shared/config/route-access"
import { ROUTES } from "@/shared/config/routes"
import { resolveAuthedTarget } from "@/shared/lib/auth-redirect"
import { useAuthStore } from "@/shared/store/auth.store"

import type { QueryClient } from "@tanstack/react-query"
import type { AnyRouteMatch } from "@tanstack/react-router"

/** Resolve a sessão corrente pelo cache ou via fetch. Retorna o `user` ou
 *  `null` quando anon (a query lançou — tipicamente 401). */
async function resolveSession(queryClient: QueryClient) {
  try {
    const { user } = await queryClient.ensureQueryData(sessionQueryOptions)
    return user
  } catch {
    return null
  }
}

/** Guard do layout autenticado: exige sessão e aplica o `staticData.access` da
 *  rota alvo (última do match). Permissão ausente → redirect silencioso pro
 *  início, que é `self` e portanto nunca nega (mata loop de redirect). */
export async function requireAccess(
  queryClient: QueryClient,
  intendedPath: string,
  matches: readonly AnyRouteMatch[]
): Promise<void> {
  const user = await resolveSession(queryClient)
  if (!user) {
    useAuthStore.getState().setRedirectIntent(intendedPath)
    throw redirect({ to: ROUTES.LOGIN })
  }
  const target = matches[matches.length - 1]
  const access = (target?.staticData as { access?: RouteAccess } | undefined)
    ?.access
  if (access?.kind === "permission") {
    const keys = Array.isArray(access.permission)
      ? access.permission
      : [access.permission]
    if (!keys.some((key) => can(user, key))) {
      throw redirect({ to: ROUTES.INICIO })
    }
  }
}

/** Guard de rota pública de auth (login): com sessão ativa → destino logado
 *  resolvido (intenção > última visitada > início). Impede usuário autenticado
 *  de ver as telas de entrada. */
export async function requireAnon(queryClient: QueryClient): Promise<void> {
  const user = await resolveSession(queryClient)
  if (user) {
    throw redirect({ to: resolveAuthedTarget() })
  }
}

/** Guard da raiz (`/`): authed → último destino logado acessível; anon → login.
 *  Sempre redireciona — a raiz não tem tela própria. */
export async function resolveRootRedirect(
  queryClient: QueryClient
): Promise<void> {
  const user = await resolveSession(queryClient)
  throw redirect({ to: user ? resolveAuthedTarget() : ROUTES.LOGIN })
}

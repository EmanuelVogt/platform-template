/**
 * Paths das rotas — fonte única consumida por router, Links e navegação.
 *
 * As chaves (identificadores) seguem inglês; os paths (URL, conteúdo
 * user-facing) são pt-BR. Nunca usar path cru no app — sempre via `ROUTES`.
 * O produto acrescenta as próprias rotas como arquivos em `app/` (convenção
 * do App Router) e as próprias entradas em `ROUTES`/`ROUTE_ACCESS`; os
 * destinos protegidos correspondentes entram com `registerProtectedRoute`
 * (abaixo), sem editar este arquivo.
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/entrar",
  INICIO: "/inicio",
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

/** Rotas protegidas (área logada) — destinos válidos para restaurar ou
 *  redirecionar um usuário autenticado. O produto acrescenta as próprias com
 *  `registerProtectedRoute`. */
const PROTECTED_ROUTES = new Set<string>([ROUTES.INICIO, "/inicio/$segment"])

/**
 * Ponto de extensão: registra um path (ou template com `$param`, ex.:
 * `/admin/$id`) como destino protegido válido — participa de
 * `toSafeProtectedRoute` e `resolveProtectedRouteTemplate` sem editar este
 * arquivo.
 */
export function registerProtectedRoute(template: string): void {
  PROTECTED_ROUTES.add(template)
}

function matchesRouteTemplate(pathname: string, template: string): boolean {
  const pathParts = pathname.split("/").filter(Boolean)
  const templateParts = template.split("/").filter(Boolean)
  if (pathParts.length !== templateParts.length) return false
  return templateParts.every((part, i) => {
    const segment = pathParts[i]
    if (segment === undefined || segment.length === 0) return false
    return part.startsWith("$") || part === segment
  })
}

/** Template em `PROTECTED_ROUTES` que casa com o pathname (exato ou `$param`). */
export function resolveProtectedRouteTemplate(
  path: string | null | undefined
): RoutePath | null {
  if (!path) return null
  const pathname = path.split(/[?#]/)[0] ?? ""
  if (!pathname) return null
  if (PROTECTED_ROUTES.has(pathname)) return pathname as RoutePath

  let best: RoutePath | null = null
  let bestLen = -1
  for (const template of PROTECTED_ROUTES) {
    if (!template.includes("$")) continue
    if (matchesRouteTemplate(pathname, template) && template.length > bestLen) {
      best = template as RoutePath
      bestLen = template.length
    }
  }
  return best
}

/** Valida path não-confiável contra rotas protegidas. Retorna o pathname
 *  concreto (não o literal `$param`) ou `null` — anti open-redirect. */
export function toSafeProtectedRoute(
  path: string | null | undefined
): RoutePath | null {
  if (!path) return null
  const pathname = path.split(/[?#]/)[0] ?? ""
  if (!resolveProtectedRouteTemplate(pathname)) return null
  // cast: `RoutePath` tipa o template; runtime precisa do id preenchido.
  return pathname as RoutePath
}

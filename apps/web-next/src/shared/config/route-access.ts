import { ROUTES, type RoutePath } from "./routes"

import type { RouteAccess } from "./route-access.types"

/** Mapa de acesso por rota — toda entrada de `ROUTES` precisa de uma linha
 *  aqui; `AccessGuard` lê por pathname (fail closed para rota ausente). */
export const ROUTE_ACCESS: Record<RoutePath, RouteAccess> = {
  [ROUTES.HOME]: { kind: "public" },
  [ROUTES.LOGIN]: { kind: "public" },
  [ROUTES.INICIO]: { kind: "authenticated" },
}

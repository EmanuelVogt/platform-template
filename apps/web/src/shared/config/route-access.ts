import { ROUTES, type RoutePath } from "./routes"

/** Chave de permissão. O template não conhece catálogo de permissão: o produto
 *  declara as suas ao acrescentar entradas em `ROUTE_ACCESS`. */
export type PermissionKey = string

export type RouteAccess =
  | { kind: "public" }
  | { kind: "self" }
  | { kind: "permission"; permission: PermissionKey | PermissionKey[] }

/** Fonte única de acesso por rota — consumida pelo router (`staticData`),
 *  pela navegação e pela cadeia de redirect. */
export const ROUTE_ACCESS: Record<RoutePath, RouteAccess> = {
  [ROUTES.HOME]: { kind: "public" },
  [ROUTES.LOGIN]: { kind: "public" },
  [ROUTES.INICIO]: { kind: "self" },
}

/** Chave de permissão. O kernel não conhece catálogo de permissão: o módulo
 *  dono e o produto declaram as suas. */
export type PermissionKey = string

/** Vocabulário de acesso por rota, declarado em `staticData.access`. O template
 *  só define a forma — quem interpreta é o guard que o módulo de identidade
 *  instala. */
export type RouteAccess =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; key: PermissionKey }

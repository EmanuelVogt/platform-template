import type { PermissionKey } from "./permissions"

/** Espelha `apps/web/src/shared/config/route-access.types.ts` do kernel. A
 *  duplicação é deliberada: a allow-list de imports de `web/core` só admite
 *  `zod`, `@platform/api-client` e relativos, então a entrada não pode importar
 *  do app que a hospeda. */
export type RouteAccess =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; key: PermissionKey }

/** Rotas que esta entrada contribui — união exata (não `string`) para que o
 *  indexador de `IDENTITY_ROUTE_ACCESS` não precise de `| undefined`. */
export type IdentityRoutePath = "/" | "/entrar" | "/inicio"

/** Fragmento do mapa rota → acesso que a entrada identity contribui. O app
 *  filho mescla este objeto com os fragmentos das outras entradas e com as
 *  rotas de produto. */
export const IDENTITY_ROUTE_ACCESS: Record<IdentityRoutePath, RouteAccess> = {
  "/": { kind: "public" },
  "/entrar": { kind: "public" },
  "/inicio": { kind: "authenticated" },
}

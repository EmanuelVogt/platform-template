import type { CurrentUser } from "./session.types"

/** Chave do catálogo de permissões do identity (`<área>.<recurso>.<ação>`). */
export type PermissionKey = string

// O perfil `master` é curinga por definição do catálogo (AD-004): ele não
// carrega permissões explícitas, logo o `includes` sozinho negaria tudo.
export function can(user: CurrentUser, key: PermissionKey): boolean {
  const granted: readonly string[] = user.permissions
  return user.accessProfile === "master" || granted.includes(key)
}

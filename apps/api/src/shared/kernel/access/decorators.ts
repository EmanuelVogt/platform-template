import { SetMetadata } from "@nestjs/common"

import type { PermissionKey } from "./permission.types"

/** Chave de metadata: rota pública (opt-out do AuthGuard e do PermissionsGuard). */
export const IS_PUBLIC_KEY = "access:isPublic"

/** Marca a rota como pública — sem sessão e sem permissão. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

/** Chave de metadata: rota máquina-a-máquina (opt-out do CsrfGuard). */
export const IS_MACHINE_TO_MACHINE_KEY = "access:isMachineToMachine"

/**
 * Rota chamada por outro sistema e autenticada por token próprio (ADR 0074).
 * Sem cookie de sessão não há credencial ambiente para um site hostil reusar —
 * a checagem de Origin do CsrfGuard pressupõe navegador e só barraria o
 * chamador legítimo, que não manda Origin. Usar junto de `@Public()` e de um
 * guard de token; sozinho, deixa a rota sem autenticação nenhuma.
 */
export const MachineToMachine = () =>
  SetMetadata(IS_MACHINE_TO_MACHINE_KEY, true)

/** Chave de metadata: auth opcional (popula userId se houver sessão, não barra). */
export const IS_OPTIONAL_AUTH_KEY = "access:isOptionalAuth"

/**
 * Auth opcional: o AuthGuard popula `userId` quando o cookie for válido mas NÃO
 * lança quando ausente/inválido; o PermissionsGuard pula a rota — quem decide o
 * acesso é a ACL do use case (modelo do download de attachment).
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true)

/** Chave de metadata: rota autenticada sem exigência de permissão. */
export const IS_SELF_SERVICE_KEY = "access:isSelfService"

/** Rota self-service: exige sessão (AuthGuard), não exige permissão (sessão, devices, notificações…). */
export const SelfService = () => SetMetadata(IS_SELF_SERVICE_KEY, true)

/** Chave de metadata: permissões exigidas pela rota (AND). */
export const REQUIRE_PERMISSION_KEY = "access:requirePermission"

/** Exige TODAS as chaves listadas (AND). Lida pelo PermissionsGuard. */
export const RequirePermission = (
  ...keys: [PermissionKey, ...PermissionKey[]]
) => SetMetadata(REQUIRE_PERMISSION_KEY, keys)

/** Chave de metadata: permissões alternativas da rota (OR — basta uma). */
export const REQUIRE_ANY_PERMISSION_KEY = "access:requireAnyPermission"

/**
 * Exige AO MENOS UMA das chaves (OR). Lida pelo PermissionsGuard. Lista vazia
 * lança na definição da classe (module load) — o authz-coverage importa todos
 * os controllers, então `[]` explode em teste, não em produção silenciosa.
 */
export const RequireAnyPermission = (keys: readonly PermissionKey[]) => {
  if (keys.length === 0) {
    throw new Error("RequireAnyPermission exige ao menos uma chave")
  }
  return SetMetadata(REQUIRE_ANY_PERMISSION_KEY, keys)
}

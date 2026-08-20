import { SetMetadata } from "@nestjs/common"

import type { AccessRequirement, PermissionKey } from "./access-policy.port"

/** Chave de metadata lida pelo AccessGuard do kernel. Ausência = fail closed. */
export const ACCESS_REQUIREMENT = "access:requirement"

const requirement = (value: AccessRequirement) =>
  SetMetadata(ACCESS_REQUIREMENT, value)

/** Marca a rota como pública — sem sessão e sem permissão. */
export const Public = () => requirement({ kind: "public" })

/** Exige apenas ator autenticado, sem permissão. */
export const Authenticated = () => requirement({ kind: "authenticated" })

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

/**
 * Auth opcional: quem decide o acesso é a ACL do use case (modelo do download
 * de attachment) — para o AccessGuard a rota é `public`.
 */
export const OptionalAuth = () => requirement({ kind: "public" })

/** Rota self-service: exige sessão, não exige permissão (sessão, devices, notificações…). */
export const SelfService = () => requirement({ kind: "authenticated" })

/** Exige a chave. Lida pelo AccessGuard do kernel. */
export const RequirePermission = (key: PermissionKey) =>
  requirement({ kind: "permission", key })

/**
 * Exige AO MENOS UMA das chaves (OR). Lista vazia lança na definição da classe
 * (module load) — o authz-coverage importa todos os controllers, então `[]`
 * explode em teste, não em produção silenciosa.
 */
export const RequireAnyPermission = (keys: readonly PermissionKey[]) => {
  if (keys.length === 0) {
    throw new Error("RequireAnyPermission exige ao menos uma chave")
  }
  return requirement({ kind: "anyPermission", keys })
}

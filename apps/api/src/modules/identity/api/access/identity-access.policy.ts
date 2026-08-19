import { Injectable, UnauthorizedException } from "@nestjs/common"

import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { IDENTITY_ACCESS } from "../../application/identity-context"

import type {
  AccessPolicy,
  AccessRequirement,
} from "../../../../shared/kernel/access/access-policy.port"
import type { Actor } from "../../../../shared/kernel/context/request-context"

/**
 * Decide o acesso a partir do que o AuthMiddleware publicou no request — é a
 * lógica do antigo PermissionsGuard atrás do port do kernel.
 *
 * Lança 401 em vez de devolver `false` quando não há ator: o `AccessGuard` só
 * sabe transformar `false` em 403, e a rota autenticada sem sessão precisa
 * continuar respondendo 401 (contrato do front e do v0.2).
 */
@Injectable()
export class IdentityAccessPolicy implements AccessPolicy {
  constructor(private readonly ctx: RequestContext) {}

  can(actor: Actor | null, requirement: AccessRequirement): boolean {
    if (requirement.kind === "public") return true

    if (actor === null) {
      throw new UnauthorizedException("Sessão inválida ou expirada.")
    }

    if (requirement.kind === "authenticated") return true

    const access = this.ctx.getExtension(IDENTITY_ACCESS)
    if (access === undefined) return false

    return access.isMaster || access.permissions.has(requirement.key)
  }
}

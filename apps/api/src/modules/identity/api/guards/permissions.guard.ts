import { Inject, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
  IS_SELF_SERVICE_KEY,
  REQUIRE_ANY_PERMISSION_KEY,
  REQUIRE_PERMISSION_KEY,
} from "../../../../shared/kernel/access/decorators"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../shared/kernel/errors/forbidden.error"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user.repository"

import type { PermissionKey } from "../../domain/permissions/permission-catalog"
import type { CanActivate, ExecutionContext } from "@nestjs/common"

/**
 * Authz fail-closed na borda. Roda como APP_GUARD APÓS o AuthGuard (userId no
 * RequestContext). @Public/@OptionalAuth → skip sem carregar user. @SelfService
 * → skip da exigência de permissão, mas ainda carrega user+set e popula
 * RequestContext.access (rota já tem sessão garantida; quem decide fino é o use
 * case, ex.: attendance-access.ts). Carrega user+set (1 query) e popula
 * RequestContext.access; master bypass. @RequirePermission = AND (toda chave),
 * @RequireAnyPermission = OR (basta uma); faltando → 403. Rota SEM declaração →
 * 403 — defesa em profundidade; o authz-coverage.spec barra.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly reflector: Reflector,
    private readonly ctx: RequestContext
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()]
    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets
      ) === true
    const isOptionalAuth =
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_OPTIONAL_AUTH_KEY,
        targets
      ) === true
    if (isPublic || isOptionalAuth) return true

    const isSelfService =
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_SELF_SERVICE_KEY,
        targets
      ) === true
    if (isSelfService) {
      await this.tryPopulateAccess()
      return true
    }

    const required = this.reflector.getAllAndOverride<
      PermissionKey[] | undefined
    >(REQUIRE_PERMISSION_KEY, targets)
    const anyOf = this.reflector.getAllAndOverride<
      readonly PermissionKey[] | undefined
    >(REQUIRE_ANY_PERMISSION_KEY, targets)
    if (required === undefined && anyOf === undefined) {
      throw new ForbiddenError()
    }

    const { userId } = this.ctx.get()
    if (userId === null) {
      throw new ForbiddenError()
    }
    const found = await this.users.findByIdWithPermissions(userId)
    if (!found || found.user.isDeleted()) {
      throw new ForbiddenError()
    }
    this.ctx.setAccess({
      permissions: new Set(found.permissions),
      isMaster: found.user.isMaster(),
    })
    if (found.user.isMaster()) return true

    const owned = new Set(found.permissions)
    if (required?.some((key) => !owned.has(key))) {
      throw new ForbiddenError()
    }
    if (anyOf !== undefined && !anyOf.some((key) => owned.has(key))) {
      throw new ForbiddenError()
    }
    return true
  }

  /**
   * @SelfService não exige permissão nenhuma, mas enriquece o contexto quando
   * dá — sem isto, rotas como registro de presença (Task 6) ficam com
   * `access: null` e o use case fecha pra todo mundo, inclusive master e quem
   * está escalado no próprio evento. Nunca pode virar 403 aqui: falha de busca
   * só deixa `access` null e a decisão cai pro use case (fail-open neste ponto
   * específico, de propósito — quem quiser fail-closed usa
   * @RequirePermission). Não simplificar de volta pra um `skip` único que
   * inclua self-service — isso emudece o `access` nessas rotas de novo.
   */
  private async tryPopulateAccess(): Promise<void> {
    const { userId } = this.ctx.get()
    if (userId === null) return
    const found = await this.users.findByIdWithPermissions(userId)
    if (!found || found.user.isDeleted()) return
    this.ctx.setAccess({
      permissions: new Set(found.permissions),
      isMaster: found.user.isMaster(),
    })
  }
}

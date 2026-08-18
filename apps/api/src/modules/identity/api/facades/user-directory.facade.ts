import { Inject, Injectable } from "@nestjs/common"

import {
  USER_REPOSITORY,
  type NotificationTarget,
  type UserRepository,
} from "../../domain/ports/user.repository"

import type { PermissionKey } from "../../domain/permissions/permission-catalog"

// Superfície pública dos erros e do DTO de rota que módulos de produto (hoje o
// professional) reusam: o `type` RFC 7807 e o shape do param são contrato de
// fio, então re-exportar é o que mantém openapi.json e respostas idênticos.
export {
  InvalidProfessionalScopeError,
  UserNotFoundError,
} from "../../domain/errors"
export { UpdateUserParamsDto } from "../contracts/identity.contract"

/**
 * Superfície pública do identity para resolver nome de exibição de QUALQUER
 * usuário por id (inclui admin/master/inativo/lixeira). Consumida pela trilha
 * de auditoria para mostrar quem agiu. Roda na transação do chamador. Ver ADR
 * 0034 (padrão anti-forwardRef) e 0041.
 */
@Injectable()
export class UserDirectoryFacade {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository
  ) {}

  findNamesByIds(ids: readonly string[]): Promise<Map<string, string>> {
    return this.users.findNamesByIds([...ids])
  }

  findIdsByNameLike(term: string): Promise<string[]> {
    return this.users.findIdsByNameLike(term)
  }

  existsProfessional(userId: string): Promise<boolean> {
    return this.users.existsProfessional(userId)
  }

  async findNameById(userId: string): Promise<string | null> {
    const user = await this.users.findById(userId)
    return user?.props.name ?? null
  }

  findNotificationTargetsByPermission(
    permission: PermissionKey
  ): Promise<NotificationTarget[]> {
    return this.users.findNotificationTargetsByPermission(permission)
  }
}

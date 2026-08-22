import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  USER_REPOSITORY,
  type ListUsersInput,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { assertPermission } from "../../assert-permission"
import { toUserListItemView } from "../../views"

import type { ListUsersOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListUsersUseCase implements UseCaseContract<
  ListUsersInput,
  ListUsersOutput
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.listUsers" })
  async execute(input: ListUsersInput): Promise<ListUsersOutput> {
    // A lixeira é outra leitura: `?deleted=true` exige a permissão própria, e
    // não vira upgrade grátis do `admin.users.read` da rota.
    if (input.deleted === true) assertPermission("admin.users.trash.read")
    const { data, page } = await this.users.list(input)
    return { data: data.map(toUserListItemView), page }
  }
}

import { Inject } from "@nestjs/common"

import { getExtension } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { IDENTITY_ACCESS } from "../../../../identity/api/facades/identity-access.facade"
import {
  TAG_REPOSITORY,
  type ListTagsInput,
  type TagRepository,
} from "../../../domain/ports/tag.repository"
import { TagUsageRegistry } from "../../tag-usage.registry"
import { toTagListItemView } from "../../views"

import type { ListTagsOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

const TRASH_PERMISSION = "admin.tags.trash.read"

/**
 * A lixeira é outra leitura: `?deleted=true` exige a permissão própria, e não
 * vira upgrade grátis do `admin.tags.read` da rota.
 *
 * SPEC_DEVIATION: a tarefa pedia o helper `assertPermission` do identity, mas
 * import entre entradas só é legal via `api/facades/` (module-boundaries) e o
 * facade não está no Touches deste cluster; a checagem usa o
 * `IDENTITY_ACCESS` que o facade já exporta, com a mesma regra (master isento,
 * ausência de contexto nega).
 * Reason: manter a fronteira de módulo e a de propriedade de arquivos.
 */
function assertTrashPermission(): void {
  const access = getExtension(IDENTITY_ACCESS)
  if (access === undefined) throw new ForbiddenError()
  if (access.isMaster) return
  if (!access.permissions.has(TRASH_PERMISSION)) throw new ForbiddenError()
}

@UseCase()
export class ListTagsUseCase implements UseCaseContract<ListTagsInput, ListTagsOutput> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tags: TagRepository,
    private readonly usage: TagUsageRegistry
  ) {}

  @ReadOnly()
  @Traced({ name: "tag.listTags" })
  async execute(input: ListTagsInput): Promise<ListTagsOutput> {
    if (input.deleted === true) assertTrashPermission()
    const { data, page } = await this.tags.list(input)
    const totals = await this.usage.totalsFor(data.map((row) => row.id))
    return {
      data: data.map((row) => toTagListItemView(row, totals.get(row.id) ?? 0)),
      page,
    }
  }
}

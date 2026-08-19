import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/tag"

export class TagNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/tag-not-found`

  constructor() {
    super("Tag não encontrada")
  }
}

export class TagConflictError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/tag-conflict`

  constructor(detail?: string) {
    super("Já existe uma tag com esse nome", detail)
  }
}

export class TagNotInTrashError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/tag-not-in-trash`

  constructor() {
    super("Tag não está na lixeira")
  }
}

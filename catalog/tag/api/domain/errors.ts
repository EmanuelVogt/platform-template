import { DomainError } from "../../../shared/kernel/errors/domain.error"

const TYPE_BASE = "https://errors.example.com/tag"

/** Tabela única de mensagens do entry tag — hoje reproduz as strings anteriores. */
const MESSAGES = {
  tagNotFound: "Tag não encontrada",
  tagConflict: "Já existe uma tag com esse nome",
  tagNotInTrash: "Tag não está na lixeira",
} as const

export { MESSAGES as TAG_MESSAGES }

export class TagNotFoundError extends DomainError {
  readonly status = 404
  readonly type = `${TYPE_BASE}/tag-not-found`

  constructor() {
    super(MESSAGES.tagNotFound)
  }
}

export class TagConflictError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/tag-conflict`

  constructor(detail?: string) {
    super(MESSAGES.tagConflict, detail)
  }
}

export class TagNotInTrashError extends DomainError {
  readonly status = 409
  readonly type = `${TYPE_BASE}/tag-not-in-trash`

  constructor() {
    super(MESSAGES.tagNotInTrash)
  }
}

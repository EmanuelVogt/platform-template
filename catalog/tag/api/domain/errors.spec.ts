import { describe, expect, it } from "vitest"

import { DomainError } from "../../../shared/kernel/errors/domain.error"

import {
  TAG_MESSAGES,
  TagConflictError,
  TagNotFoundError,
  TagNotInTrashError,
} from "./errors"

describe("errors de domínio tag", () => {
  it("todos os erros estendem DomainError", () => {
    const errors = [
      new TagNotFoundError(),
      new TagConflictError(),
      new TagNotInTrashError(),
    ]
    for (const err of errors) {
      expect(err).toBeInstanceOf(DomainError)
    }
  })

  it("TagNotFoundError: status 404, título vem da tabela única de mensagens", () => {
    const err = new TagNotFoundError()
    expect(err.status).toBe(404)
    expect(err.type).toBe("https://errors.example.com/tag/tag-not-found")
    expect(err.title).toBe(TAG_MESSAGES.tagNotFound)
  })

  it("TagConflictError: status 409, título inalterado por padrão", () => {
    const err = new TagConflictError()
    expect(err.status).toBe(409)
    expect(err.title).toBe("Já existe uma tag com esse nome")
  })

  it("TagNotInTrashError: status 409", () => {
    const err = new TagNotInTrashError()
    expect(err.status).toBe(409)
    expect(err.title).toBe(TAG_MESSAGES.tagNotInTrash)
  })
})

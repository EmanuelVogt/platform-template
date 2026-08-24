import { describe, expect, it } from "vitest"

import { DomainError } from "../../../shared/kernel/errors/domain.error"

import {
  ATTACHMENT_MESSAGES,
  AttachmentNotFoundError,
  EmptyUploadBatchError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  UploadsSaturatedError,
} from "./errors"

describe("errors de domínio attachment", () => {
  it("todos os erros estendem DomainError", () => {
    const errors = [
      new AttachmentNotFoundError(),
      new UnsupportedMediaTypeError(),
      new PayloadTooLargeError(),
      new EmptyUploadBatchError(),
      new UploadsSaturatedError(),
    ]
    for (const err of errors) {
      expect(err).toBeInstanceOf(DomainError)
    }
  })

  it("AttachmentNotFoundError: status 404, título vem da tabela única de mensagens", () => {
    const err = new AttachmentNotFoundError()
    expect(err.status).toBe(404)
    expect(err.title).toBe(ATTACHMENT_MESSAGES.notFound)
  })

  it("EmptyUploadBatchError: title/detail inalterados por padrão", () => {
    const err = new EmptyUploadBatchError()
    expect(err.title).toBe("Nenhum arquivo enviado")
    expect(err.message).toBe("Selecione ao menos um arquivo para enviar.")
  })

  it("UploadsSaturatedError: status 503, Retry-After 2s", () => {
    const err = new UploadsSaturatedError()
    expect(err.status).toBe(503)
    expect(err.retryAfterSeconds).toBe(2)
    expect(err.title).toBe(ATTACHMENT_MESSAGES.uploadsSaturatedTitle)
  })
})

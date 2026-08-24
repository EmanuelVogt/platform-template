import { describe, expect, it, vi } from "vitest"

import { parseAttachmentConfig } from "../../attachment.config"
import { PendingQuotaExceededError, UploadsSaturatedError } from "../../domain/errors"

import { UploadGate } from "./multipart-files"
import { UploadAttachmentsController } from "./upload-attachments.controller"

import type { RequestContext } from "../../../../shared/kernel/context/request-context"
import type { UploadAttachmentsBatchUseCase } from "../../application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case"
import type { AttachmentRepository } from "../../domain/ports/attachment.repository"

function makeController(opts: { pendingBytes?: number; maxConcurrentUploads?: number }) {
  const config = parseAttachmentConfig({
    ATTACHMENT_MAX_CONCURRENT_UPLOADS: String(opts.maxConcurrentUploads ?? 16),
  })
  const executeMock = vi.fn()
  const upload = { execute: executeMock } as unknown as UploadAttachmentsBatchUseCase
  const ctx = { getActor: () => ({ id: "owner-1" }) } as unknown as RequestContext
  const sumPendingBytesByOwnerMock = vi.fn(async () => opts.pendingBytes ?? 0)
  const repo = {
    sumPendingBytesByOwner: sumPendingBytesByOwnerMock,
  } as unknown as AttachmentRepository
  const uploadGate = new UploadGate(config)
  const controller = new UploadAttachmentsController(
    upload,
    ctx,
    {} as never,
    repo,
    config,
    uploadGate,
  )
  return { controller, executeMock, sumPendingBytesByOwnerMock, uploadGate }
}

describe("UploadAttachmentsController", () => {
  it("recusa com 503 quando a instância não tem vaga de upload concorrente, antes de checar a cota (corpo não lido)", async () => {
    const { controller, executeMock, sumPendingBytesByOwnerMock, uploadGate } = makeController({
      maxConcurrentUploads: 1,
    })
    expect(uploadGate.tryAcquire()).not.toBeNull()

    await expect(
      controller.handle(
        { profile: "image" } as never,
        { headers: { "content-length": "10" } } as never,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(UploadsSaturatedError)

    expect(sumPendingBytesByOwnerMock).not.toHaveBeenCalled()
    expect(executeMock).not.toHaveBeenCalled()
  })

  it("recusa com 413 quando pendentes do dono + Content-Length estouram a cota, sem ler o corpo", async () => {
    const { controller, executeMock } = makeController({ pendingBytes: 2_147_483_648 })

    await expect(
      controller.handle(
        { profile: "image" } as never,
        { headers: { "content-length": "1" } } as never,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(PendingQuotaExceededError)

    expect(executeMock).not.toHaveBeenCalled()
  })
})

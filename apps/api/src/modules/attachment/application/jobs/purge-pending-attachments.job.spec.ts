import { Attachment } from "../../domain/attachment.entity"

import { PurgePendingAttachmentsJob } from "./purge-pending-attachments.job"

function stale() {
  return Attachment.createPending({
    contentType: "application/pdf",
    sizeBytes: 10,
    originalFilename: null,
    profile: "multi",
    visibility: "restricted",
    ownerUserId: "user-1",
  })
}

const logger = {
  forModule: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
} as never

describe("PurgePendingAttachmentsJob", () => {
  it("apaga objeto e linha dos pendentes vencidos", async () => {
    const attachment = stale()
    const repo = {
      findPendingOlderThan: jest.fn(async () => [attachment]),
      deleteByIds: jest.fn(async () => undefined),
    }
    const storage = { delete: jest.fn(async () => undefined) }
    const job = new PurgePendingAttachmentsJob(storage as never, repo as never, logger)

    await job.run()

    expect(storage.delete).toHaveBeenCalledWith(attachment.props.storageKey)
    expect(repo.deleteByIds).toHaveBeenCalledWith([attachment.props.id])
  })

  it("apaga a linha mesmo se o objeto não existir no storage", async () => {
    const attachment = stale()
    const repo = {
      findPendingOlderThan: jest.fn(async () => [attachment]),
      deleteByIds: jest.fn(async () => undefined),
    }
    const storage = {
      delete: jest.fn(async () => {
        throw new Error("NoSuchKey")
      }),
    }
    const job = new PurgePendingAttachmentsJob(storage as never, repo as never, logger)

    await job.run()

    expect(repo.deleteByIds).toHaveBeenCalledWith([attachment.props.id])
  })

  it("não chama o repositório quando não há vencidos", async () => {
    const repo = {
      findPendingOlderThan: jest.fn(async () => []),
      deleteByIds: jest.fn(async () => undefined),
    }
    const job = new PurgePendingAttachmentsJob({ delete: jest.fn() } as never, repo as never, logger)

    await job.run()

    expect(repo.deleteByIds).not.toHaveBeenCalled()
  })
})

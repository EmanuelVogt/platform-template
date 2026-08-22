import { Attachment } from "../../../domain/attachment.entity"

import { DeleteAttachmentUseCase } from "./delete-attachment.use-case"

function makeDeps(found: Attachment | null) {
  const onCommitCbs: (() => Promise<void> | void)[] = []
  const storage = {
    delete: jest.fn(),
    put: jest.fn(),
    getStream: jest.fn(),
    head: jest.fn(),
    putStream: jest.fn(),
  }
  const repo = {
    findById: jest.fn().mockResolvedValue(found),
    update: jest.fn(),
    insert: jest.fn(),
    insertMany: jest.fn(),
    findByIds: jest.fn(),
    saveMany: jest.fn(),
    findPendingOlderThan: jest.fn(),
    deletePendingByIds: jest.fn(),
    sumPendingBytesByOwner: jest.fn(),
  }
  const log = {
    record: jest.fn(),
    recordInTx: jest.fn(),
    listByAttachment: jest.fn(),
    deleteBatchOlderThan: jest.fn(),
  }
  const tx = { onCommit: (cb: () => Promise<void> | void) => onCommitCbs.push(cb) }
  const ctx = {
    get: () => ({ ip: null, userAgent: null, correlationId: "c" }),
    getActor: () => ({ id: "u-1", kind: "user" }),
  }
  const uc = new DeleteAttachmentUseCase(storage, repo, log, tx as never, ctx as never)
  return { uc, storage, repo, log, onCommitCbs }
}

const a = Attachment.create({ storageKey: "attachments/k", contentType: "image/png", sizeBytes: 1, checksum: "z", originalFilename: null, profile: "avatar", visibility: "authenticated", ownerUserId: "u-1" })

describe("DeleteAttachmentUseCase", () => {
  it("soft-delete + agenda delete no R2 via onCommit", async () => {
    const { uc, storage, repo, onCommitCbs } = makeDeps(a)
    await uc.execute({ id: a.props.id })
    expect(repo.update).toHaveBeenCalledTimes(1)
    expect(storage.delete).not.toHaveBeenCalled() // só roda no onCommit
    await Promise.all(onCommitCbs.map((cb) => Promise.resolve(cb())))
    expect(storage.delete).toHaveBeenCalledWith(a.props.storageKey)
  })

  it("id inexistente é no-op", async () => {
    const { uc, repo } = makeDeps(null)
    await uc.execute({ id: "x" })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it("attachment já deletado é no-op", async () => {
    const deleted = a.markDeleted()
    const { uc, repo, storage, log, onCommitCbs } = makeDeps(deleted)
    await uc.execute({ id: deleted.props.id })
    expect(repo.update).not.toHaveBeenCalled()
    expect(log.record).not.toHaveBeenCalled()
    expect(log.recordInTx).not.toHaveBeenCalled()
    expect(onCommitCbs).toHaveLength(0)
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it("registra acesso de delete no access log via recordInTx, dentro da tx", async () => {
    const { uc, log } = makeDeps(a)
    await uc.execute({ id: a.props.id })
    expect(log.record).not.toHaveBeenCalled()
    expect(log.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentId: a.props.id,
        userId: "u-1",
        action: "delete",
        outcome: "allowed",
        correlationId: "c",
      }),
    )
  })
})

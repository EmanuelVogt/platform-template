import { Attachment } from "../../../domain/attachment.entity"
import { AttachmentNotFoundError } from "../../../domain/errors"

import { GetAttachmentForDownloadUseCase } from "./get-attachment-for-download.use-case"

function entity(visibility: "public" | "authenticated" | "restricted", owner: string | null) {
  return Attachment.fromProps({
    id: "a-1", storageKey: "attachments/a-1", contentType: "image/png", sizeBytes: 9,
    checksum: "sum", originalFilename: null, profile: "avatar", visibility, ownerUserId: owner,
    status: "ready", createdAt: new Date(), updatedAt: new Date(),
  })
}

function makeDeps(userId: string | null) {
  const storage = {
    getStream: jest.fn().mockResolvedValue("STREAM"),
    put: jest.fn(),
    head: jest.fn(),
    delete: jest.fn(),
    putStream: jest.fn(),
  }
  const repo = {
    findById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    insertMany: jest.fn(),
    findByIds: jest.fn(),
    saveMany: jest.fn(),
    findPendingOlderThan: jest.fn(),
    deleteByIds: jest.fn(),
    sumPendingBytesByOwner: jest.fn(),
  }
  const log = {
    record: jest.fn(),
    recordInTx: jest.fn(),
    listByAttachment: jest.fn(),
    deleteBatchOlderThan: jest.fn(),
  }
  const ctx = {
    get: () => ({ ip: "2.2.2.2", userAgent: "ua", correlationId: "c2" }),
    getActor: () => (userId === null ? null : { id: userId, kind: "user" }),
  }
  const uc = new GetAttachmentForDownloadUseCase(storage, repo, log, ctx as never)
  return { uc, storage, repo, log }
}

describe("GetAttachmentForDownloadUseCase", () => {
  it("permitido: retorna meta e loga allowed sem abrir o stream", async () => {
    const { uc, repo, log, storage } = makeDeps("u-9")
    repo.findById.mockResolvedValue(entity("authenticated", "u-1"))
    const out = await uc.execute({ id: "a-1" })
    expect(out.contentType).toBe("image/png")
    expect(out.checksum).toBe("sum")
    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ action: "download", outcome: "allowed" }))
    expect(storage.getStream).not.toHaveBeenCalled()
  })

  it("openStream: abre o storage adapter exatamente uma vez, sob demanda", async () => {
    const { uc, repo, storage } = makeDeps("u-9")
    repo.findById.mockResolvedValue(entity("authenticated", "u-1"))
    const out = await uc.execute({ id: "a-1" })
    expect(storage.getStream).not.toHaveBeenCalled()
    const stream = await out.openStream()
    expect(stream).toBe("STREAM")
    expect(storage.getStream).toHaveBeenCalledTimes(1)
    expect(storage.getStream).toHaveBeenCalledWith("attachments/a-1")
  })

  it("negado: loga denied e lança NotFound (anti-vazamento)", async () => {
    const { uc, repo, log } = makeDeps(null)
    repo.findById.mockResolvedValue(entity("restricted", "u-1"))
    await expect(uc.execute({ id: "a-1" })).rejects.toBeInstanceOf(AttachmentNotFoundError)
    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "denied" }))
  })

  it("trusted: libera restricted sem ser o dono", async () => {
    const { uc, repo, log } = makeDeps("admin-1")
    repo.findById.mockResolvedValue(entity("restricted", "u-1"))
    const out = await uc.execute({ id: "a-1", trusted: true })
    expect(out.checksum).toBe("sum")
    expect(log.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "download", outcome: "allowed" }),
    )
  })

  it("inexistente: lança NotFound", async () => {
    const { uc, repo } = makeDeps("u-1")
    repo.findById.mockResolvedValue(null)
    await expect(uc.execute({ id: "x" })).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })
})

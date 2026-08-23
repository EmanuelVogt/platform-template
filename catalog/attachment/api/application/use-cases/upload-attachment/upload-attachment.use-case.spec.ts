import { describe, expect, it, vi } from "vitest"

import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../../../domain/errors"
import { buildUploadProfiles } from "../../../domain/upload-profiles"

import { UploadAttachmentUseCase } from "./upload-attachment.use-case"

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n")

function makeDeps() {
  const storage = {
    put: vi.fn(),
    getStream: vi.fn(),
    head: vi.fn(),
    delete: vi.fn(),
    putStream: vi.fn(),
  }
  const repo = {
    insert: vi.fn(),
    insertMany: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    update: vi.fn(),
    saveMany: vi.fn(),
    findPendingOlderThan: vi.fn(),
    deleteByIds: vi.fn(),
  }
  const log = {
    record: vi.fn(),
    recordInTx: vi.fn(),
    listByAttachment: vi.fn(),
    deleteBatchOlderThan: vi.fn(),
  }
  const tx = { run: (fn: () => Promise<void>) => fn() }
  const ctx = {
    get: () => ({ ip: "1.1.1.1", userAgent: "jest", correlationId: "c1" }),
    getActor: () => ({ id: "admin-1", kind: "user" }),
  }
  const profiles = buildUploadProfiles({
    ATTACHMENT_MAX_UPLOAD_BYTES: 5_000_000,
    ATTACHMENT_MULTI_MAX_FILE_BYTES: 100_000_000,
    ATTACHMENT_MULTI_MAX_TOTAL_BYTES: 1_000_000_000,
  })
  const uc = new UploadAttachmentUseCase(storage, repo, log, tx as never, ctx as never, profiles)
  return { uc, storage, repo, log }
}

describe("UploadAttachmentUseCase", () => {
  it("rejeita arquivo acima do limite", async () => {
    const { uc } = makeDeps()
    await expect(
      uc.execute({ bytes: Buffer.alloc(6_000_000), declaredContentType: "image/png", originalFilename: null, profile: "avatar", ownerUserId: null }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it("rejeita quando magic bytes não batem", async () => {
    const { uc } = makeDeps()
    await expect(
      uc.execute({ bytes: Buffer.from("xx"), declaredContentType: "image/png", originalFilename: null, profile: "avatar", ownerUserId: null }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError)
  })

  it("sobe no R2 ANTES de persistir e grava log de upload", async () => {
    const { uc, storage, repo, log } = makeDeps()
    const { id } = await uc.execute({ bytes: png, declaredContentType: "image/png", originalFilename: "a.png", profile: "avatar", ownerUserId: "u-1" })
    expect(storage.put).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ action: "upload", outcome: "allowed", attachmentId: id, userId: "admin-1" }))
  })

  it("aceita arquivo exatamente no limite e não lança PayloadTooLargeError", async () => {
    const { uc, storage } = makeDeps()
    // byteLength === ATTACHMENT_MAX_UPLOAD_BYTES: condição > não dispara
    const atLimit = Buffer.concat([png, Buffer.alloc(5_000_000 - png.byteLength)])
    await expect(
      uc.execute({ bytes: atLimit, declaredContentType: "image/png", originalFilename: null, profile: "avatar", ownerUserId: null }),
    ).resolves.toBeDefined()
    expect(storage.put).toHaveBeenCalledTimes(1)
  })

  it("aceita bytes não-imagem quando o profile aceita qualquer tipo", async () => {
    const { uc, storage, repo } = makeDeps()
    await expect(
      uc.execute({ bytes: pdf, declaredContentType: "application/pdf", originalFilename: "agenda.pdf", profile: "document", ownerUserId: "u-1" }),
    ).resolves.toBeDefined()
    expect(storage.put).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledTimes(1)
  })

  it("preserva o content-type declarado quando o profile aceita qualquer tipo", async () => {
    const { uc, storage } = makeDeps()
    await uc.execute({ bytes: pdf, declaredContentType: "application/pdf", originalFilename: "agenda.pdf", profile: "document", ownerUserId: "u-1" })
    expect(storage.put).toHaveBeenCalledWith(expect.any(String), pdf, "application/pdf")
  })

  it("rejeita quando magic bytes indicam tipo diferente do declarado", async () => {
    const { uc, storage, repo } = makeDeps()
    // png contém magic bytes de PNG, mas declaredContentType afirma JPEG → sniffed !== declaredContentType
    await expect(
      uc.execute({ bytes: png, declaredContentType: "image/jpeg", originalFilename: null, profile: "avatar", ownerUserId: null }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError)
    expect(storage.put).not.toHaveBeenCalled()
    expect(repo.insert).not.toHaveBeenCalled()
  })
})

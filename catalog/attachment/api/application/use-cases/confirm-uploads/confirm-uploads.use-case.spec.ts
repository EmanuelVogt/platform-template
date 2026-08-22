import { describe, expect, it, vi } from "vitest"

import { parseAttachmentConfig } from "../../../attachment.config"
import { Attachment } from "../../../domain/attachment.entity"
import {
  AttachmentNotFoundError,
  UploadNotConfirmableError,
  UploadQuotaExceededError,
} from "../../../domain/errors"
import { buildUploadProfiles } from "../../../domain/upload-profiles"

import { ConfirmUploadsUseCase } from "./confirm-uploads.use-case"

const profiles = buildUploadProfiles(parseAttachmentConfig({}))

function pending(overrides: Partial<{ sizeBytes: number; ownerUserId: string }> = {}) {
  return Attachment.createPending({
    contentType: "application/pdf",
    sizeBytes: overrides.sizeBytes ?? 100,
    originalFilename: "log.txt",
    profile: "multi",
    visibility: "restricted",
    ownerUserId: overrides.ownerUserId ?? "user-1",
  })
}

function makeUseCase(stored: Attachment[], head: { sizeBytes: number; etag: string } | null) {
  const saved: Attachment[] = []
  const repo = {
    findByIds: vi.fn(async () => stored),
    saveMany: vi.fn(async (list: Attachment[]) => void saved.push(...list)),
  }
  const storage = {
    head: vi.fn(async () =>
      head === null ? null : { contentType: "application/pdf", sizeBytes: head.sizeBytes, etag: head.etag },
    ),
  }
  const tx = { run: (fn: () => Promise<void>) => fn() }
  return {
    useCase: new ConfirmUploadsUseCase(
      storage as never,
      repo as never,
      profiles,
      tx as never,
    ),
    saved,
    repo,
  }
}

describe("ConfirmUploadsUseCase", () => {
  it("promove para ready com tamanho real e checksum do ETag", async () => {
    const attachment = pending({ sizeBytes: 100 })
    const { useCase, saved } = makeUseCase([attachment], { sizeBytes: 90, etag: '"abc"' })

    await useCase.execute({
      ids: [attachment.props.id],
      profile: "multi",
      ownerUserId: "user-1",
    })

    expect(saved[0]!.props.status).toBe("ready")
    expect(saved[0]!.props.sizeBytes).toBe(90)
    expect(saved[0]!.props.checksum).toBe("abc")
  })

  it("recusa anexo de outro usuário", async () => {
    const attachment = pending({ ownerUserId: "user-2" })
    const { useCase } = makeUseCase([attachment], { sizeBytes: 90, etag: '"abc"' })

    await expect(
      useCase.execute({
        ids: [attachment.props.id],
        profile: "multi",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(UploadNotConfirmableError)
  })

  it("recusa id inexistente", async () => {
    const { useCase } = makeUseCase([], { sizeBytes: 1, etag: '"a"' })

    await expect(
      useCase.execute({
        ids: ["01JMISSING"],
        profile: "multi",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })

  it("recusa quando o objeto não chegou ao storage", async () => {
    const attachment = pending()
    const { useCase } = makeUseCase([attachment], null)

    await expect(
      useCase.execute({
        ids: [attachment.props.id],
        profile: "multi",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(UploadNotConfirmableError)
  })

  it("recusa objeto maior que o declarado", async () => {
    const attachment = pending({ sizeBytes: 100 })
    const { useCase } = makeUseCase([attachment], { sizeBytes: 101, etag: '"abc"' })

    await expect(
      useCase.execute({
        ids: [attachment.props.id],
        profile: "multi",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)
  })

  it("recusa soma real acima do teto mesmo com cada anexo aprovado no upload individual", async () => {
    const a = pending({ sizeBytes: 600_000_000 })
    const b = pending({ sizeBytes: 600_000_000 })
    const { useCase } = makeUseCase([a, b], { sizeBytes: 600_000_000, etag: '"abc"' })

    await expect(
      useCase.execute({
        ids: [a.props.id, b.props.id],
        profile: "multi",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)
  })
})

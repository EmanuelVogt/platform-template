import { Readable } from "node:stream"

import { type Mock, describe, expect, it, vi } from "vitest"

import { parseAttachmentConfig } from "../../../attachment.config"
import {
  EmptyUploadBatchError,
  UploadInterruptedError,
  UploadQuotaExceededError,
} from "../../../domain/errors"
import { buildUploadProfiles } from "../../../domain/upload-profiles"

import { UploadAttachmentsBatchUseCase } from "./upload-attachments-batch.use-case"

import type { Attachment } from "../../../domain/attachment.entity"
import type { IncomingFile } from "../../../domain/incoming-file"

const profiles = buildUploadProfiles(
  parseAttachmentConfig({
    ATTACHMENT_MULTI_MAX_FILE_BYTES: "100",
    ATTACHMENT_MULTI_MAX_TOTAL_BYTES: "100",
  }),
)

function makeUseCase() {
  const inserted: Attachment[] = []
  const repo = {
    insertMany: vi.fn(async (rows: Attachment[]) => void inserted.push(...rows)),
  }
  const storage = {
    putStream: vi.fn(async (_key: string, body: Readable) => {
      for await (const _chunk of body) {
        // drena o stream como o R2 faria
      }
    }),
    delete: vi.fn(async (_key: string) => undefined),
  }
  const tx = { run: (fn: () => Promise<void>) => fn() }
  const useCase = new UploadAttachmentsBatchUseCase(
    storage as never,
    repo as never,
    profiles,
    tx as never,
  )
  return { useCase, repo, storage, inserted }
}

function file(name: string, sizeBytes: number): IncomingFile {
  return {
    filename: name,
    contentType: "application/pdf",
    stream: Readable.from([Buffer.alloc(sizeBytes)]),
  }
}

/** Arquivo cujo corpo morre no meio, como numa conexão que cai. */
function brokenFile(name: string, failure: Error): IncomingFile {
  return {
    filename: name,
    contentType: "application/pdf",
    stream: new Readable({
      read() {
        this.destroy(failure)
      },
    }),
  }
}

async function* iterate(...files: IncomingFile[]): AsyncGenerator<IncomingFile> {
  for (const item of files) yield item
}

function keysOf(mock: Mock): unknown[] {
  return mock.mock.calls.map((call) => call[0])
}

describe("UploadAttachmentsBatchUseCase", () => {
  it("sobe cada arquivo e devolve os ids na ordem recebida", async () => {
    const { useCase, storage, inserted } = makeUseCase()

    const out = await useCase.execute({
      profile: "multi",
      ownerUserId: "user-1",
      files: iterate(file("a.pdf", 10), file("b.pdf", 20)),
    })

    expect(out.uploads).toHaveLength(2)
    expect(storage.putStream).toHaveBeenCalledTimes(2)
    expect(inserted.map((row) => row.props.originalFilename)).toEqual(["a.pdf", "b.pdf"])
    expect(inserted.map((row) => row.props.id)).toEqual(
      out.uploads.map((upload) => upload.attachmentId),
    )
  })

  it("grava o tamanho medido, não o declarado", async () => {
    const { useCase, inserted } = makeUseCase()

    await useCase.execute({
      profile: "multi",
      ownerUserId: "user-1",
      files: iterate(file("a.pdf", 37)),
    })

    expect(inserted[0]?.props.sizeBytes).toBe(37)
  })

  it("recusa o lote que passa do teto somado", async () => {
    const { useCase } = makeUseCase()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(file("a.pdf", 60), file("b.pdf", 60)),
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)
  })

  it("a mensagem do teto excedido fala em MB, não em bytes", async () => {
    const { useCase } = makeUseCase()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(file("a.pdf", 60), file("b.pdf", 60)),
      }),
    ).rejects.toThrow(/^O total não pode passar de \d+ MB\.$/)
  })

  it("recusa o lote que passa do teto de quantidade", async () => {
    const { useCase } = makeUseCase()
    const many = Array.from({ length: 101 }, (_, index) =>
      file(`f${String(index)}.pdf`, 0),
    )

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(...many),
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)
  })

  it("não grava nenhuma linha quando um arquivo do lote falha", async () => {
    const { useCase, repo } = makeUseCase()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(file("a.pdf", 10), file("b.pdf", 200)),
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)
    expect(repo.insertMany).not.toHaveBeenCalled()
  })

  it("apaga do bucket o que já tinha subido quando o lote falha", async () => {
    const { useCase, storage } = makeUseCase()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(file("a.pdf", 10), file("b.pdf", 200)),
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)

    expect(keysOf(storage.delete)).toEqual(keysOf(storage.putStream))
    expect(storage.delete).toHaveBeenCalledTimes(2)
  })

  it("apaga do bucket o que subiu quando a gravação no banco falha", async () => {
    const { useCase, storage, repo } = makeUseCase()
    const dbFailure = new Error("banco fora do ar")
    repo.insertMany.mockRejectedValueOnce(dbFailure)

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(file("a.pdf", 10)),
      }),
    ).rejects.toBe(dbFailure)

    expect(keysOf(storage.delete)).toEqual(keysOf(storage.putStream))
  })

  it("erro ao apagar não encobre o motivo da recusa", async () => {
    const { useCase, storage } = makeUseCase()
    storage.delete.mockRejectedValue(new Error("bucket indisponível"))

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(file("a.pdf", 10), file("b.pdf", 200)),
      }),
    ).rejects.toBeInstanceOf(UploadQuotaExceededError)
  })

  it("corpo que morre no meio vira erro de envio interrompido, não erro de servidor", async () => {
    const { useCase, storage } = makeUseCase()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(brokenFile("a.pdf", new Error("Unexpected end of form"))),
      }),
    ).rejects.toBeInstanceOf(UploadInterruptedError)

    expect(keysOf(storage.delete)).toEqual(keysOf(storage.putStream))
  })

  it("preserva o erro de domínio que vem do corpo", async () => {
    const { useCase } = makeUseCase()
    const interrupted = new UploadInterruptedError()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(brokenFile("a.pdf", interrupted)),
      }),
    ).rejects.toBe(interrupted)
  })

  it("recusa lote vazio sem tocar no storage", async () => {
    const { useCase, storage, repo } = makeUseCase()

    await expect(
      useCase.execute({
        profile: "multi",
        ownerUserId: "user-1",
        files: iterate(),
      }),
    ).rejects.toBeInstanceOf(EmptyUploadBatchError)

    expect(storage.putStream).not.toHaveBeenCalled()
    expect(repo.insertMany).not.toHaveBeenCalled()
  })
})

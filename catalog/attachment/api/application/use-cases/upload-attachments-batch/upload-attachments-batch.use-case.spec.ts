import { Readable } from "node:stream"

import { type Mock, describe, expect, it, vi } from "vitest"


import { parseAttachmentConfig } from "../../../attachment.config"
import {
  EmptyUploadBatchError,
  UnsupportedMediaTypeError,
  UploadInterruptedError,
  UploadQuotaExceededError,
} from "../../../domain/errors"
import { buildUploadProfiles } from "../../../domain/upload-profiles"

import { UploadAttachmentsBatchUseCase } from "./upload-attachments-batch.use-case"

import type { Attachment } from "../../../domain/attachment.entity"
import type { IncomingFile } from "../../../domain/incoming-file"

const baseConfig = parseAttachmentConfig({
  ATTACHMENT_MULTI_MAX_FILE_BYTES: "100",
  ATTACHMENT_MULTI_MAX_TOTAL_BYTES: "100",
})

const profiles = buildUploadProfiles(baseConfig)

// Perfil isolado accept:"image" com maxFiles > 1 — nenhum perfil base cobre
// isso (avatar/access-link-avatar/image são maxFiles:1) e os testes de sniff
// em lote precisam de pelo menos 2 arquivos.
const imageBatchProfiles = buildUploadProfiles(baseConfig, [
  {
    key: "image-batch-test",
    accept: "image",
    maxBytes: 1000,
    maxTotalBytes: 5000,
    maxFiles: 5,
    visibility: "restricted",
    uploadRoute: true,
  },
])

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function makeUseCase(catalog = profiles) {
  const inserted: Attachment[] = []
  const stored = new Map<string, Buffer>()
  const repo = {
    insertMany: vi.fn(async (rows: Attachment[]) => void inserted.push(...rows)),
  }
  const storage = {
    putStream: vi.fn(async (key: string, body: Readable) => {
      const chunks: Buffer[] = []
      for await (const chunk of body) chunks.push(chunk as Buffer)
      stored.set(key, Buffer.concat(chunks))
    }),
    delete: vi.fn(async (_key: string) => undefined),
  }
  const tx = { run: (fn: () => Promise<void>) => fn() }
  const useCase = new UploadAttachmentsBatchUseCase(
    storage as never,
    repo as never,
    catalog,
    tx as never,
  )
  return { useCase, repo, storage, inserted, stored }
}

function file(name: string, sizeBytes: number): IncomingFile {
  return {
    filename: name,
    contentType: "application/pdf",
    stream: Readable.from([Buffer.alloc(sizeBytes)]),
  }
}

/** Arquivo com Content-Type declarado e corpo próprio (streams binários — não
 *  object mode — pra `sniffImageStream` acumular como um upload real faria). */
function typedFile(
  name: string,
  declaredContentType: string,
  chunks: Buffer[],
): IncomingFile {
  return {
    filename: name,
    contentType: declaredContentType,
    stream: Readable.from(chunks, { objectMode: false }),
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

  describe("perfil accept:image — sniff por magic bytes", () => {
    it("sobe PNG entregue em 2 chunks com o checksum/tamanho intacto (unshift não trunca) e persiste o tipo farejado", async () => {
      const { useCase, inserted, stored } = makeUseCase(imageBatchProfiles)
      const rest = Buffer.from("resto-do-arquivo-png-que-nao-pode-sumir")
      const full = Buffer.concat([PNG_SIGNATURE, rest])
      // Dois chunks pequenos: primeiro corta no meio da assinatura, obrigando
      // o sniff a acumular mais de uma leitura antes de decidir.
      const chunks = [PNG_SIGNATURE.subarray(0, 4), PNG_SIGNATURE.subarray(4), rest]

      await useCase.execute({
        profile: "image-batch-test" as never,
        ownerUserId: "user-1",
        files: iterate(typedFile("a.png", "image/png", chunks)),
      })

      expect(inserted[0]?.props.contentType).toBe("image/png")
      expect(inserted[0]?.props.sizeBytes).toBe(full.byteLength)
      const storedBytes = [...stored.values()][0]
      expect(storedBytes?.equals(full)).toBe(true)
    })

    it("recusa arquivo cujo Content-Type declarado não bate com os magic bytes (415)", async () => {
      const { useCase } = makeUseCase(imageBatchProfiles)
      const htmlBytes = Buffer.from("<html><body>não é imagem</body></html>")

      await expect(
        useCase.execute({
          profile: "image-batch-test" as never,
          ownerUserId: "user-1",
          files: iterate(typedFile("fake.png", "image/png", [htmlBytes])),
        }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeError)
    })

    it("lote com 1 imagem válida + 1 spoofada: nada é persistido, tudo que subiu é descartado", async () => {
      const { useCase, repo, storage } = makeUseCase(imageBatchProfiles)
      const htmlBytes = Buffer.from("<html><body>spoof</body></html>")

      await expect(
        useCase.execute({
          profile: "image-batch-test" as never,
          ownerUserId: "user-1",
          files: iterate(
            typedFile("real.png", "image/png", [PNG_SIGNATURE]),
            typedFile("fake.png", "image/png", [htmlBytes]),
          ),
        }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeError)

      expect(repo.insertMany).not.toHaveBeenCalled()
      // O primeiro arquivo (válido) já tinha ido ao bucket antes do segundo
      // falhar o sniff — o discard do lote apaga exatamente esse objeto.
      expect(storage.putStream).toHaveBeenCalledTimes(1)
      expect(storage.delete).toHaveBeenCalledTimes(1)
    })
  })
})

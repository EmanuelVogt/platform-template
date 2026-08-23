import { PassThrough, Readable } from "node:stream"

import { type Mock, describe, expect, it, vi } from "vitest"

import {
  InvalidMultipartRequestError,
  PayloadTooLargeError,
  UnexpectedMultipartFieldError,
  UploadInterruptedError,
} from "../../domain/errors"

import { readMultipartFiles } from "./multipart-files"

import type { MultipartLimits } from "./multipart-files"
import type { IncomingFile } from "../../domain/incoming-file"
import type { Request, Response } from "express"

const BOUNDARY = "----teste"

const GENEROUS_LIMITS: MultipartLimits = { maxBytes: 1_000_000, maxFiles: 10 }

interface FakeResponse {
  headersSent: boolean
  setHeader: Mock
}

function fakeResponse(): FakeResponse {
  return { headersSent: false, setHeader: vi.fn() }
}

function asResponse(res: FakeResponse): Response {
  return res as unknown as Response
}

function partOf(file: { field: string; filename: string; content: string }): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
    `Content-Type: text/plain\r\n\r\n${file.content}\r\n`
  )
}

function fieldPartOf(field: { name: string; value: string }): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`
  )
}

function bodyWith(
  files: { field: string; filename: string; content: string }[],
): Buffer {
  return Buffer.from(`${files.map(partOf).join("")}--${BOUNDARY}--\r\n`)
}

function withRequestShape(stream: Readable, contentType: string): Request {
  const req = stream as unknown as Request
  req.headers = { "content-type": contentType }
  req.complete = false
  req.on("end", () => {
    req.complete = true
  })
  return req
}

function fakeRequest(body: Buffer): Request {
  return withRequestShape(
    Readable.from([body]),
    `multipart/form-data; boundary=${BOUNDARY}`,
  )
}

/** Requisição que o teste alimenta aos poucos, como um cliente de verdade. */
function streamingRequest(): { req: Request; socket: PassThrough } {
  const socket = new PassThrough()
  return {
    req: withRequestShape(socket, `multipart/form-data; boundary=${BOUNDARY}`),
    socket,
  }
}

async function collect(
  req: Request,
  res: FakeResponse,
  limits: MultipartLimits = GENEROUS_LIMITS,
): Promise<{ filename: string; content: string }[]> {
  const out: { filename: string; content: string }[] = []
  for await (const file of readMultipartFiles(req, asResponse(res), "file", limits)) {
    const chunks: Buffer[] = []
    for await (const chunk of file.stream) chunks.push(chunk as Buffer)
    out.push({ filename: file.filename, content: Buffer.concat(chunks).toString() })
  }
  return out
}

function deferred(): { done: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined
  const done = new Promise<void>((settle) => {
    resolve = settle
  })
  return { done, resolve }
}

async function nextFile(files: AsyncGenerator<IncomingFile>): Promise<IncomingFile> {
  const result = await files.next()
  if (result.done === true) throw new Error("esperava um arquivo no corpo")
  return result.value
}

describe("readMultipartFiles", () => {
  it("entrega os arquivos do campo pedido na ordem do corpo — lote limpo dentro dos limites", async () => {
    const req = fakeRequest(
      bodyWith([
        { field: "file", filename: "a.txt", content: "primeiro" },
        { field: "file", filename: "b.txt", content: "segundo" },
      ]),
    )

    expect(await collect(req, fakeResponse())).toEqual([
      { filename: "a.txt", content: "primeiro" },
      { filename: "b.txt", content: "segundo" },
    ])
  })

  it("recusa parte de campo diferente do esperado (400 UnexpectedMultipartFieldError)", async () => {
    const req = fakeRequest(
      bodyWith([
        { field: "outro", filename: "x.txt", content: "estranho" },
        { field: "file", filename: "a.txt", content: "nunca chega" },
      ]),
    )

    await expect(collect(req, fakeResponse())).rejects.toBeInstanceOf(
      UnexpectedMultipartFieldError,
    )
  })

  it("recusa parte que não é arquivo (fieldsLimit: 0 campos não-arquivo aceitos)", async () => {
    const req = fakeRequest(
      Buffer.from(
        `${fieldPartOf({ name: "description", value: "oi" })}--${BOUNDARY}--\r\n`,
      ),
    )

    await expect(collect(req, fakeResponse())).rejects.toBeInstanceOf(
      InvalidMultipartRequestError,
    )
  })

  it("recusa arquivo acima do fileSize do perfil (413 PayloadTooLargeError)", async () => {
    const req = fakeRequest(
      bodyWith([{ field: "file", filename: "a.txt", content: "0123456789" }]),
    )

    await expect(
      collect(req, fakeResponse(), { maxBytes: 4, maxFiles: 10 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  // Lote no limite exato passa: o teto de `parts` do busboy é `maxFiles + 1`
  // porque ele avisa ao ALCANÇAR o teto, não ao ultrapassá-lo (REM-08, e2e de
  // upload pegava 413 num único PNG com maxFiles=1).
  it("aceita lote no limite exato de maxFiles", async () => {
    const req = fakeRequest(
      bodyWith([{ field: "file", filename: "a.txt", content: "um" }]),
    )

    expect(await collect(req, fakeResponse(), { maxBytes: 1_000_000, maxFiles: 1 })).toEqual([
      { filename: "a.txt", content: "um" },
    ])
  })

  // Quem barra o excesso é `files`; `fields: 0` já derruba parte não-arquivo.
  it("recusa lote acima de maxFiles (413)", async () => {
    const req = fakeRequest(
      bodyWith([
        { field: "file", filename: "a.txt", content: "um" },
        { field: "file", filename: "b.txt", content: "dois" },
      ]),
    )

    await expect(
      collect(req, fakeResponse(), { maxBytes: 1_000_000, maxFiles: 1 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it("devolve nada quando o corpo não tem arquivo", async () => {
    const req = fakeRequest(Buffer.from(`--${BOUNDARY}--\r\n`))

    expect(await collect(req, fakeResponse())).toEqual([])
  })

  it("não mexe na conexão quando o corpo chega inteiro", async () => {
    const req = fakeRequest(
      bodyWith([{ field: "file", filename: "a.txt", content: "primeiro" }]),
    )
    const res = fakeResponse()

    await collect(req, res)

    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it("corta o recebimento quando o consumidor abandona o laço no meio", async () => {
    const { req, socket } = streamingRequest()
    const res = fakeResponse()

    socket.write(
      partOf({ field: "file", filename: "a.txt", content: "primeiro" }) +
        partOf({ field: "file", filename: "b.txt", content: "segundo" }),
    )

    const seen: IncomingFile[] = []
    for await (const file of readMultipartFiles(req, asResponse(res), "file", GENEROUS_LIMITS)) {
      seen.push(file)
      break
    }

    expect(seen).toHaveLength(1)
    expect(seen[0]?.stream.destroyed).toBe(true)
    // Para de puxar o corpo, mas a conexão sobrevive: quem escreve a resposta
    // de erro vem depois.
    expect(socket.readableFlowing).not.toBe(true)
    expect(socket.destroyed).toBe(false)
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "close")
  })

  it("acorda o laço quando o cliente desliga no meio do envio", async () => {
    const { req, socket } = streamingRequest()
    const res = fakeResponse()
    const files = readMultipartFiles(req, asResponse(res), "file", GENEROUS_LIMITS)

    socket.write(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="a.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\nprimeiros bytes`,
    )
    const file = await nextFile(files)
    socket.destroy()

    await expect(files.next()).rejects.toBeInstanceOf(UploadInterruptedError)
    expect(file.stream.destroyed).toBe(true)
  })

  // Cenário real do envio grande: o consumidor está parado esperando os
  // próximos bytes do arquivo quando a conexão morre. Nada além do arquivo em
  // voo ser derrubado com erro libera esse consumidor.
  it(
    "libera o consumidor que está drenando o arquivo quando a requisição cai",
    async () => {
      const { req, socket } = streamingRequest()
      const draining = deferred()
      const seen: Readable[] = []

      const consume = (async () => {
        for await (const file of readMultipartFiles(
          req,
          asResponse(fakeResponse()),
          "file",
          GENEROUS_LIMITS,
        )) {
          seen.push(file.stream)
          for await (const chunk of file.stream) {
            void chunk
            draining.resolve()
          }
        }
      })()

      socket.write(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="a.txt"\r\n` +
          `Content-Type: text/plain\r\n\r\nprimeiros bytes`,
      )
      await draining.done
      socket.destroy()

      await expect(consume).rejects.toBeInstanceOf(UploadInterruptedError)
      expect(seen[0]?.destroyed).toBe(true)
    },
    3000,
  )

  it("acorda o laço quando o cliente desliga sem nenhum arquivo completo", async () => {
    const { req, socket } = streamingRequest()
    const files = readMultipartFiles(req, asResponse(fakeResponse()), "file", GENEROUS_LIMITS)

    const pending = files.next()
    socket.write(`--${BOUNDARY}\r\n`)
    socket.destroy()

    await expect(pending).rejects.toBeInstanceOf(UploadInterruptedError)
  })

  it("recusa corpo que não é multipart", async () => {
    const req = withRequestShape(Readable.from([Buffer.from("{}")]), "application/json")

    await expect(collect(req, fakeResponse())).rejects.toBeInstanceOf(
      InvalidMultipartRequestError,
    )
  })

  it("recusa corpo multipart que termina antes do primeiro arquivo", async () => {
    const req = fakeRequest(Buffer.from(`--${BOUNDARY}\r\n`))

    await expect(collect(req, fakeResponse())).rejects.toBeInstanceOf(
      InvalidMultipartRequestError,
    )
  })

  it("recusa campo não-arquivo acima do fieldSize (400, valor truncado)", async () => {
    const req = fakeRequest(
      Buffer.from(
        `${fieldPartOf({ name: "legenda", value: "0123456789" })}--${BOUNDARY}--\r\n`,
      ),
    )

    await expect(
      collect(req, fakeResponse(), {
        maxBytes: 1_000_000,
        maxFiles: 1,
        fields: 1,
        fieldSize: 4,
      }),
    ).rejects.toBeInstanceOf(InvalidMultipartRequestError)
  })

  it(
    "recusa mais partes que o teto de `parts` (400/413) e destrói o arquivo em voo",
    async () => {
      const { req, socket } = streamingRequest()
      const draining = deferred()
      const seen: Readable[] = []
      const limits: MultipartLimits = { maxBytes: 1_000_000, maxFiles: 2, fields: 1 }

      const consume = (async () => {
        for await (const file of readMultipartFiles(
          req,
          asResponse(fakeResponse()),
          "file",
          limits,
        )) {
          seen.push(file.stream)
          for await (const chunk of file.stream) {
            void chunk
            draining.resolve()
          }
        }
      })()

      socket.write(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="a.txt"\r\n` +
          `Content-Type: text/plain\r\n\r\nprimeiros bytes`,
      )
      await draining.done

      // Campo (parte 2, dentro de fields:1) + 2º arquivo (parte 3, dentro de
      // files:2) — a 3ª parte alcança o teto de `parts` (maxFiles+1=3) sem
      // estourar `files` nem `fields`: só `partsLimit` dispara, isolado dos
      // outros dois — é o que faltava provar (REM-15). `\r\n` inicial fecha a
      // parte 1, que não tinha o boundary de encerramento ainda.
      socket.write(
        `\r\n${fieldPartOf({ name: "legenda", value: "oi" })}` +
          partOf({ field: "file", filename: "b.txt", content: "outro" }) +
          `--${BOUNDARY}--\r\n`,
      )

      await expect(consume).rejects.toBeInstanceOf(PayloadTooLargeError)
      expect(seen[0]?.destroyed).toBe(true)
    },
    3000,
  )
})

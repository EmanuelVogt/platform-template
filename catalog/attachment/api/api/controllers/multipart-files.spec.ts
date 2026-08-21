import { PassThrough, Readable } from "node:stream"

import { InvalidMultipartRequestError, UploadInterruptedError } from "../../domain/errors"

import { readMultipartFiles } from "./multipart-files"

import type { IncomingFile } from "../../domain/incoming-file"
import type { Request, Response } from "express"

const BOUNDARY = "----teste"

interface FakeResponse {
  headersSent: boolean
  setHeader: jest.Mock
}

function fakeResponse(): FakeResponse {
  return { headersSent: false, setHeader: jest.fn() }
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
): Promise<{ filename: string; content: string }[]> {
  const out: { filename: string; content: string }[] = []
  for await (const file of readMultipartFiles(req, asResponse(res), "file")) {
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
  it("entrega os arquivos do campo pedido na ordem do corpo", async () => {
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

  it("ignora arquivo de outro campo", async () => {
    const req = fakeRequest(
      bodyWith([
        { field: "outro", filename: "x.txt", content: "descartado" },
        { field: "file", filename: "a.txt", content: "mantido" },
      ]),
    )

    expect(await collect(req, fakeResponse())).toEqual([
      { filename: "a.txt", content: "mantido" },
    ])
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
    for await (const file of readMultipartFiles(req, asResponse(res), "file")) {
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
    const files = readMultipartFiles(req, asResponse(res), "file")

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
    const files = readMultipartFiles(req, asResponse(fakeResponse()), "file")

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
})

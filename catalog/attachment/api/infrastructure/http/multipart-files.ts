import busboy from "busboy"

import { InvalidMultipartRequestError, UploadInterruptedError } from "../../domain/errors"

import type { IncomingFile } from "../../domain/incoming-file"
import type { Request, Response } from "express"
import type { Readable } from "node:stream"

function createParser(req: Request): ReturnType<typeof busboy> {
  try {
    return busboy({ headers: req.headers })
  } catch {
    // Content-type ausente ou fora do multipart: pedido malformado, não falha
    // do servidor.
    throw new InvalidMultipartRequestError()
  }
}

/**
 * Entrega os arquivos do corpo multipart um a um, na ordem em que chegam. O
 * busboy só emite o próximo depois que o stream anterior é drenado, então o
 * consumidor sequencial mantém a memória constante mesmo num lote grande.
 */
export async function* readMultipartFiles(
  req: Request,
  res: Response,
  fieldName: string,
): AsyncGenerator<IncomingFile> {
  const parser = createParser(req)
  const queue: IncomingFile[] = []
  let finished = false
  let failure: Error | null = null
  let inFlight: Readable | null = null
  let wake: (() => void) | null = null

  const notify = (): void => {
    const pending = wake
    wake = null
    pending?.()
  }

  // Leitura por função: quem escreve são os callbacks do parser e da
  // requisição, e o laço abaixo precisa enxergar o valor do momento, não o do
  // início.
  const takeFailure = (): Error | null => failure
  const isFinished = (): boolean => finished
  const takeInFlight = (): Readable | null => inFlight

  const fail = (error: Error): void => {
    // Vale a primeira causa: o corte que vem depois é consequência dela.
    failure ??= error
    finished = true
    // Derruba o arquivo em voo com erro: é o que faz o envio ao storage
    // desistir em vez de ficar esperando bytes que não vêm mais.
    inFlight?.destroy(error)
    notify()
  }

  parser.on("file", (name, stream, info) => {
    // O busboy derruba o arquivo em voo com erro quando o parser é cortado, e
    // stream de erro sem ouvinte derruba o processo inteiro.
    stream.on("error", () => undefined)
    if (name !== fieldName) {
      stream.resume()
      return
    }
    queue.push({
      filename: info.filename,
      contentType: info.mimeType,
      stream,
    })
    notify()
  })
  parser.on("close", () => {
    finished = true
    notify()
  })
  parser.on("error", () => {
    fail(new InvalidMultipartRequestError())
  })

  // Fim anormal da requisição não vira evento no parser: sem estes ouvintes, o
  // cliente que desliga no meio deixa o laço esperando para sempre.
  req.on("error", () => {
    fail(new UploadInterruptedError())
  })
  req.on("close", () => {
    if (!req.complete) fail(new UploadInterruptedError())
  })

  req.pipe(parser)

  try {
    for (;;) {
      const failed = takeFailure()
      if (failed !== null) throw failed
      const next = queue.shift()
      if (next !== undefined) {
        inFlight = next.stream
        yield next
        inFlight = null
        continue
      }
      if (isFinished()) return
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  } finally {
    req.unpipe(parser)
    parser.destroy()
    takeInFlight()?.destroy()
    // Corte de cota ou erro no meio: o resto do corpo não interessa mais, mas
    // matar o socket aqui faria o cliente receber conexão fechada no lugar do
    // motivo da recusa. Marca a conexão para encerrar DEPOIS que a resposta
    // sair — o resto do corpo o Node descarta sozinho.
    if (!req.complete && !res.headersSent) {
      res.setHeader("Connection", "close")
    }
  }
}

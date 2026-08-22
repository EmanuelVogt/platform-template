import { Inject, Injectable } from "@nestjs/common"
import busboy from "busboy"

import { InFlightGate } from "../../../../shared/kernel/collections/in-flight-gate"
import { ATTACHMENT_CONFIG, type AttachmentConfig } from "../../attachment.config"
import {
  InvalidMultipartRequestError,
  PayloadTooLargeError,
  UnexpectedMultipartFieldError,
  UploadInterruptedError,
} from "../../domain/errors"

import type { IncomingFile } from "../../domain/incoming-file"
import type { Request, Response } from "express"
import type { Readable } from "node:stream"

/** Vagas de upload concorrente, na instância — 503 antes de ler o corpo
 *  quando não sobra nenhuma; a liberação é responsabilidade de quem adquire. */
@Injectable()
export class UploadGate {
  private readonly gate: InFlightGate

  constructor(@Inject(ATTACHMENT_CONFIG) config: AttachmentConfig) {
    this.gate = new InFlightGate(config.ATTACHMENT_MAX_CONCURRENT_UPLOADS)
  }

  tryAcquire(): (() => void) | null {
    return this.gate.tryAcquire()
  }
}

/** Bordas do perfil de upload que o parser precisa pra bloquear cedo, sem
 *  confiar no que o cliente declara no corpo. */
export interface MultipartLimits {
  readonly maxBytes: number
  readonly maxFiles: number
}

function createParser(req: Request, limits: MultipartLimits): ReturnType<typeof busboy> {
  try {
    return busboy({
      headers: req.headers,
      // `parts` no teto de `files`: só arquivos do campo esperado passam por
      // aqui (campo estranho é rejeitado antes de contar), então parts/files
      // colapsam no mesmo número. `fields` em 0 — a rota não aceita nenhum
      // campo não-arquivo.
      limits: { fileSize: limits.maxBytes, files: limits.maxFiles, parts: limits.maxFiles, fields: 0 },
    })
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
  limits: MultipartLimits,
): AsyncGenerator<IncomingFile> {
  const parser = createParser(req, limits)
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
      stream.destroy()
      fail(new UnexpectedMultipartFieldError())
      return
    }
    stream.on("limit", () => {
      fail(new PayloadTooLargeError())
    })
    queue.push({
      filename: info.filename,
      contentType: info.mimeType,
      stream,
    })
    notify()
  })
  parser.on("filesLimit", () => {
    fail(new PayloadTooLargeError())
  })
  parser.on("partsLimit", () => {
    fail(new PayloadTooLargeError())
  })
  parser.on("fieldsLimit", () => {
    fail(new InvalidMultipartRequestError())
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

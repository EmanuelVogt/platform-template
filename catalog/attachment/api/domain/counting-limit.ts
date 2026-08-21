import { Transform } from "node:stream"

import { UploadQuotaExceededError } from "./errors"
import { formatMegabytes } from "./format-megabytes"

/**
 * Conta os bytes que passam e derruba o fluxo no instante em que a cota
 * estoura — sem esperar o corpo inteiro chegar para então recusar.
 */
export class CountingLimit extends Transform {
  private counted = 0
  private over = false

  constructor(private readonly limitBytes: number) {
    super()
  }

  get bytes(): number {
    return this.counted
  }

  get exceeded(): boolean {
    return this.over
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error) => void,
  ): void {
    this.counted += chunk.length
    if (this.counted > this.limitBytes) {
      this.over = true
      done(
        new UploadQuotaExceededError(
          `O total não pode passar de ${formatMegabytes(this.limitBytes)}.`,
        ),
      )
      return
    }
    this.push(chunk)
    done()
  }
}

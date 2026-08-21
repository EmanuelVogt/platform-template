import type { Readable } from "node:stream"

export interface IncomingFile {
  filename: string
  contentType: string
  stream: Readable
}

import type { Readable } from "node:stream"

/** Storage de objetos S3-compat (R2). Bytes puros, sem política de acesso. */
export interface ObjectStoragePort {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  getStream(key: string): Promise<NodeJS.ReadableStream>
  head(
    key: string
  ): Promise<{ contentType: string; sizeBytes: number; etag: string } | null>
  delete(key: string): Promise<void>
  /** Repassa o stream ao bucket sem materializar o conteúdo em memória. */
  putStream(key: string, body: Readable, contentType: string): Promise<void>
}

export const OBJECT_STORAGE: unique symbol = Symbol("ObjectStorage")

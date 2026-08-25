import { StorageUnavailableError } from "./storage-unavailable.error"

import type { ObjectStoragePort } from "./object-storage.port"
import type { Readable } from "node:stream"

/** SEAM-05: liga sem `STORAGE_*` configurado — cada chamada real falha com `StorageUnavailableError`. */
export class NullStorageAdapter implements ObjectStoragePort {
  async put(_key: string, _body: Buffer, _contentType: string): Promise<void> {
    throw new StorageUnavailableError()
  }

  async getStream(_key: string): Promise<NodeJS.ReadableStream> {
    throw new StorageUnavailableError()
  }

  async head(_key: string): Promise<{
    contentType: string
    sizeBytes: number
    etag: string
  } | null> {
    throw new StorageUnavailableError()
  }

  async delete(_key: string): Promise<void> {
    throw new StorageUnavailableError()
  }

  async putStream(
    _key: string,
    _body: Readable,
    _contentType: string
  ): Promise<void> {
    throw new StorageUnavailableError()
  }
}

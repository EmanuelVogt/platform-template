import { StorageUnavailableError } from "./storage-unavailable.error"

import type { ObjectStoragePort } from "./object-storage.port"

/** SEAM-05: liga sem `STORAGE_*` configurado — cada chamada real falha com `StorageUnavailableError`. */
export class NullStorageAdapter implements ObjectStoragePort {
  async put(): Promise<void> {
    throw new StorageUnavailableError()
  }

  async getStream(): Promise<NodeJS.ReadableStream> {
    throw new StorageUnavailableError()
  }

  async head(): Promise<{
    contentType: string
    sizeBytes: number
    etag: string
  } | null> {
    throw new StorageUnavailableError()
  }

  async delete(): Promise<void> {
    throw new StorageUnavailableError()
  }

  async putStream(): Promise<void> {
    throw new StorageUnavailableError()
  }
}

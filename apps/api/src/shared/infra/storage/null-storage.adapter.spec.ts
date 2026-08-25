import { Readable } from "node:stream"

import { describe, expect, it } from "vitest"

import { NullStorageAdapter } from "./null-storage.adapter"
import { StorageUnavailableError } from "./storage-unavailable.error"

describe("NullStorageAdapter", () => {
  const adapter = new NullStorageAdapter()

  it("put rejeita com StorageUnavailableError", async () => {
    await expect(
      adapter.put("k", Buffer.from("x"), "text/plain")
    ).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  it("getStream rejeita com StorageUnavailableError", async () => {
    await expect(adapter.getStream("k")).rejects.toBeInstanceOf(
      StorageUnavailableError
    )
  })

  it("head rejeita com StorageUnavailableError", async () => {
    await expect(adapter.head("k")).rejects.toBeInstanceOf(
      StorageUnavailableError
    )
  })

  it("delete rejeita com StorageUnavailableError", async () => {
    await expect(adapter.delete("k")).rejects.toBeInstanceOf(
      StorageUnavailableError
    )
  })

  it("putStream rejeita com StorageUnavailableError", async () => {
    const body = Readable.from([Buffer.from("x")])
    await expect(
      adapter.putStream("k", body, "text/plain")
    ).rejects.toBeInstanceOf(StorageUnavailableError)
  })
})

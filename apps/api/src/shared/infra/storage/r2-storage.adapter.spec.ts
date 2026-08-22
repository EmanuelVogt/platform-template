import { Readable } from "node:stream"

import { S3Client } from "@aws-sdk/client-s3"

import { R2StorageAdapter } from "./r2-storage.adapter"
import { StorageUnavailableError } from "./storage-unavailable.error"

import type { StorageConfig } from "./storage.config"
import type * as AwsS3 from "@aws-sdk/client-s3"

// Boundary S3-compat: testing.md proíbe mock de banco, não de SaaS externo.
// Commands reais são necessários para o Upload do lib-storage montar o
// multipart; só `send` é stub.
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3")
  return {
    ...actual,
    S3Client: jest.fn((config: AwsS3.S3ClientConfig) => {
      const client = new actual.S3Client(config)
      const send = jest.fn()
      ;(client as { send: jest.Mock }).send = send
      return client
    }),
  }
})

const cfg: StorageConfig = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key-id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket-test",
  R2_ENDPOINT: "https://r2.example.com",
  STORAGE_REQUEST_TIMEOUT_MS: 30_000,
  STORAGE_MAX_SOCKETS: 50,
}

function timeoutError(): Error {
  const error = new Error("timed out")
  error.name = "TimeoutError"
  return error
}

describe("R2StorageAdapter", () => {
  let adapter: R2StorageAdapter
  let sendMock: jest.Mock
  const S3ClientMock = S3Client as unknown as jest.Mock

  beforeEach(() => {
    S3ClientMock.mockClear()
    adapter = new R2StorageAdapter(cfg)
    const client = S3ClientMock.mock.results[0]?.value as { send: jest.Mock }
    sendMock = client.send
  })

  it("configura o client R2 (region auto, path-style, credenciais, requestHandler com timeout/maxSockets)", () => {
    expect(S3ClientMock).toHaveBeenCalledWith({
      region: "auto",
      endpoint: cfg.R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.R2_ACCESS_KEY_ID,
        secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      },
      requestHandler: {
        requestTimeout: cfg.STORAGE_REQUEST_TIMEOUT_MS,
        connectionTimeout: 5000,
        httpsAgent: expect.objectContaining({
          keepAlive: true,
          maxSockets: cfg.STORAGE_MAX_SOCKETS,
        }) as unknown,
      },
    })
  })

  it("put envia PutObjectCommand com bucket/key/body/contentType e abortSignal", async () => {
    sendMock.mockResolvedValue({})
    const body = Buffer.from("dados")

    await adapter.put("avatars/u1.png", body, "image/png")

    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: "bucket-test",
        Key: "avatars/u1.png",
        Body: body,
        ContentType: "image/png",
      },
    })
    expect(sendMock.mock.calls[0]?.[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) as unknown })
  })

  it("put mapeia TimeoutError do SDK pra StorageUnavailableError (503)", async () => {
    sendMock.mockRejectedValue(timeoutError())

    await expect(adapter.put("k", Buffer.from("x"), "text/plain")).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
  })

  it("getStream retorna o Body do GetObjectCommand sem passar abortSignal", async () => {
    const fakeStream = { pipe: jest.fn() }
    sendMock.mockResolvedValue({ Body: fakeStream })

    const out = await adapter.getStream("k")

    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      input: { Bucket: "bucket-test", Key: "k" },
    })
    expect(sendMock.mock.calls[0]?.[1]).toBeUndefined()
    expect(out).toBe(fakeStream)
  })

  it("head mapeia contentType/sizeBytes/etag da resposta", async () => {
    sendMock.mockResolvedValue({
      ContentType: "image/png",
      ContentLength: 1234,
      ETag: '"abc"',
    })

    expect(await adapter.head("k")).toEqual({
      contentType: "image/png",
      sizeBytes: 1234,
      etag: "abc",
    })
    expect(sendMock.mock.calls[0]?.[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) as unknown })
  })

  it("head aplica defaults quando a resposta omite os campos", async () => {
    sendMock.mockResolvedValue({})

    expect(await adapter.head("k")).toEqual({
      contentType: "application/octet-stream",
      sizeBytes: 0,
      etag: "",
    })
  })

  it("head retorna null quando o objeto não existe (send rejeita com erro comum)", async () => {
    sendMock.mockRejectedValue(new Error("NotFound"))

    expect(await adapter.head("inexistente")).toBeNull()
  })

  it("head mapeia TimeoutError do SDK pra StorageUnavailableError em vez de null", async () => {
    sendMock.mockRejectedValue(timeoutError())

    await expect(adapter.head("k")).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  it("delete envia DeleteObjectCommand com a key e abortSignal", async () => {
    sendMock.mockResolvedValue({})

    await adapter.delete("k")

    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      input: { Bucket: "bucket-test", Key: "k" },
    })
    expect(sendMock.mock.calls[0]?.[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) as unknown })
  })

  it("delete mapeia AbortError do SDK pra StorageUnavailableError (503)", async () => {
    const error = new Error("aborted")
    error.name = "AbortError"
    sendMock.mockRejectedValue(error)

    await expect(adapter.delete("k")).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  it("putStream repassa o stream ao bucket com a key e o contentType", async () => {
    sendMock.mockResolvedValue({ ETag: '"abc"' })
    const body = Readable.from([Buffer.from("primeiro"), Buffer.from("segundo")])

    await adapter.putStream("attachments/01J", body, "application/pdf")

    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: "bucket-test",
        Key: "attachments/01J",
        ContentType: "application/pdf",
      },
    })
  })

  it("putStream propaga a falha do stream de origem", async () => {
    sendMock.mockResolvedValue({ ETag: '"abc"' })
    const body = new Readable({
      read() {
        this.destroy(new Error("origem interrompida"))
      },
    })

    await expect(
      adapter.putStream("attachments/01J", body, "application/pdf"),
    ).rejects.toThrow("origem interrompida")
  })
})

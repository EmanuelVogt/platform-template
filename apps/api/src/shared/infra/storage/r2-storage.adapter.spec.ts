import { Readable } from "node:stream"

import { S3Client } from "@aws-sdk/client-s3"

import { R2StorageAdapter } from "./r2-storage.adapter"

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

  it("configura o client R2 (region auto, path-style, credenciais)", () => {
    expect(S3ClientMock).toHaveBeenCalledWith({
      region: "auto",
      endpoint: cfg.R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.R2_ACCESS_KEY_ID,
        secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      },
    })
  })

  it("put envia PutObjectCommand com bucket/key/body/contentType", async () => {
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
  })

  it("getStream retorna o Body do GetObjectCommand", async () => {
    const fakeStream = { pipe: jest.fn() }
    sendMock.mockResolvedValue({ Body: fakeStream })

    const out = await adapter.getStream("k")

    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      input: { Bucket: "bucket-test", Key: "k" },
    })
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
  })

  it("head aplica defaults quando a resposta omite os campos", async () => {
    sendMock.mockResolvedValue({})

    expect(await adapter.head("k")).toEqual({
      contentType: "application/octet-stream",
      sizeBytes: 0,
      etag: "",
    })
  })

  it("head retorna null quando o objeto não existe (send rejeita)", async () => {
    sendMock.mockRejectedValue(new Error("NotFound"))

    expect(await adapter.head("inexistente")).toBeNull()
  })

  it("delete envia DeleteObjectCommand com a key", async () => {
    sendMock.mockResolvedValue({})

    await adapter.delete("k")

    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      input: { Bucket: "bucket-test", Key: "k" },
    })
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

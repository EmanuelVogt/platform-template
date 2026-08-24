import https from "node:https"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

import { StorageUnavailableError } from "./storage-unavailable.error"

import type { ObjectStoragePort } from "./object-storage.port"
import type { StorageConfig } from "./storage.config"
import type { Readable } from "node:stream"

/** Rejeita SDK `TimeoutError`/`AbortError` como indisponibilidade do storage. */
function mapStorageError(error: unknown): never {
  const name = error instanceof Error ? error.name : undefined
  if (name === "TimeoutError" || name === "AbortError") {
    throw new StorageUnavailableError()
  }
  throw error
}

/** Adapter R2 (S3-compat). `region: "auto"` é o exigido pelo R2. */
export class R2StorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly requestTimeoutMs: number

  constructor(cfg: StorageConfig) {
    this.requestTimeoutMs = cfg.STORAGE_REQUEST_TIMEOUT_MS
    this.client = new S3Client({
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
        httpsAgent: new https.Agent({
          keepAlive: true,
          maxSockets: cfg.STORAGE_MAX_SOCKETS,
        }),
      },
    })
    this.bucket = cfg.R2_BUCKET
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
        { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) }
      )
    } catch (error) {
      mapStorageError(error)
    }
  }

  // Sem abortSignal: o corpo pode levar mais que STORAGE_REQUEST_TIMEOUT_MS pra
  // ser consumido pelo cliente HTTP do download — cortar aqui truncaria um
  // download lento e legítimo. O `requestTimeout` do handler já cobre um peer
  // travado antes do primeiro byte.
  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    )
    return out.Body as NodeJS.ReadableStream
  }

  async head(
    key: string
  ): Promise<{ contentType: string; sizeBytes: number; etag: string } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) }
      )
      return {
        contentType: out.ContentType ?? "application/octet-stream",
        sizeBytes: out.ContentLength ?? 0,
        etag: (out.ETag ?? "").replaceAll('"', ""),
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : undefined
      if (name === "TimeoutError" || name === "AbortError") {
        throw new StorageUnavailableError()
      }
      return null
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) }
      )
    } catch (error) {
      mapStorageError(error)
    }
  }

  async putStream(
    key: string,
    body: Readable,
    contentType: string
  ): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      // Parte de 8 MB com 2 em voo: memória do processo fica constante mesmo
      // num lote de centenas de MB. O lib-storage aborta o multipart sozinho
      // quando o stream de origem falha.
      partSize: 8 * 1024 * 1024,
      queueSize: 2,
      abortController: buildAbortController(this.requestTimeoutMs),
    })
    try {
      await upload.done()
    } catch (error) {
      mapStorageError(error)
    }
  }
}

function buildAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController()
  AbortSignal.timeout(timeoutMs).addEventListener("abort", () => {
    controller.abort()
  })
  return controller
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

import type { ObjectStoragePort } from "./object-storage.port"
import type { StorageConfig } from "./storage.config"
import type { Readable } from "node:stream"

/** Adapter R2 (S3-compat). `region: "auto"` é o exigido pelo R2. */
export class R2StorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(cfg: StorageConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: cfg.R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.R2_ACCESS_KEY_ID,
        secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      },
    })
    this.bucket = cfg.R2_BUCKET
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    return out.Body as NodeJS.ReadableStream
  }

  async head(
    key: string,
  ): Promise<{ contentType: string; sizeBytes: number; etag: string } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return {
        contentType: out.ContentType ?? "application/octet-stream",
        sizeBytes: out.ContentLength ?? 0,
        etag: (out.ETag ?? "").replaceAll('"', ""),
      }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  async putStream(key: string, body: Readable, contentType: string): Promise<void> {
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
    })
    await upload.done()
  }
}

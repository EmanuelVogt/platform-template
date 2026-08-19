import {
  createTestDb,
  createTestPool,
  truncateAttachment,
} from "../../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../../test/setup/test-logger"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { parseAttachmentConfig } from "../../../attachment.config"
import { PayloadTooLargeError } from "../../../domain/errors"
import { buildUploadProfiles } from "../../../domain/upload-profiles"
import { DrizzleAttachmentAccessLogRepository } from "../../../infrastructure/repositories/drizzle-attachment-access-log.repository"
import { DrizzleAttachmentRepository } from "../../../infrastructure/repositories/drizzle-attachment.repository"

import { UploadAttachmentUseCase } from "./upload-attachment.use-case"

import type { ObjectStoragePort } from "../../../../../shared/infra/storage/object-storage.port"
import type { RequestContextStore } from "../../../../../shared/kernel/context/request-context"
import type { UploadProfileDef } from "../../../domain/upload/upload-profile.types"
import type { UploadProfileName } from "../../../domain/upload-profiles"
import type { Pool } from "pg"

function makeInMemoryStorage(): ObjectStoragePort {
  const objects = new Map<string, { body: Buffer; contentType: string }>()
  return {
    put: (key, body, contentType) => {
      objects.set(key, { body: Buffer.from(body), contentType })
      return Promise.resolve()
    },
    getStream: () => {
      throw new Error("não usado nesta suíte")
    },
    head: (key) => {
      const o = objects.get(key)
      return Promise.resolve(
        o ? { contentType: o.contentType, sizeBytes: o.body.length, etag: "" } : null,
      )
    },
    delete: (key) => {
      objects.delete(key)
      return Promise.resolve()
    },
    putStream: async (key, body, contentType) => {
      const chunks: Buffer[] = []
      for await (const chunk of body) {
        chunks.push(chunk as Buffer)
      }
      objects.set(key, { body: Buffer.concat(chunks), contentType })
    },
  }
}

function authedStore(): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId: "c1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    userId: "u-1",
    sessionId: "sess-1",
    deviceId: null,
    access: null,
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

// Perfil de produto fictício injetado pelo slot, provando a extensão fora do
// base-set: any, 10 bytes, 1 arquivo, restricted.
const SAMPLE_DOC_DEF: UploadProfileDef = {
  key: "sample-doc",
  accept: "any",
  maxBytes: 10,
  maxTotalBytes: 10,
  maxFiles: 1,
  visibility: "restricted",
  uploadRoute: true,
}
const SAMPLE_DOC_PROFILE = "sample-doc" as unknown as UploadProfileName

describe("UploadAttachmentUseCase — perfil de produto injetado (int)", () => {
  let pool: Pool
  let uc: UploadAttachmentUseCase
  let repo: DrizzleAttachmentRepository
  let ctx: RequestContext

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    ctx = new RequestContext()
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory, ctx)
    repo = new DrizzleAttachmentRepository(txm)
    const accessLog = new DrizzleAttachmentAccessLogRepository(txm)
    const profiles = buildUploadProfiles(parseAttachmentConfig({}), [SAMPLE_DOC_DEF])
    uc = new UploadAttachmentUseCase(
      makeInMemoryStorage(),
      repo,
      accessLog,
      txm,
      ctx,
      profiles,
    )
  })

  afterEach(async () => {
    await truncateAttachment(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  function run(bytes: Buffer): Promise<{ id: string }> {
    return ctx.run(authedStore(), () =>
      uc.execute({
        bytes,
        declaredContentType: "application/octet-stream",
        originalFilename: "f.bin",
        profile: SAMPLE_DOC_PROFILE,
        ownerUserId: "u-1",
      }),
    )
  }

  it("rejeita upload de 11 bytes contra o teto de 10 do perfil injetado", async () => {
    await expect(run(Buffer.alloc(11))).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it("aceita upload de 10 bytes e persiste com a visibility do perfil injetado", async () => {
    const { id } = await run(Buffer.alloc(10))
    const found = await repo.findById(id)
    expect(found?.props.profile).toBe("sample-doc")
    expect(found?.props.visibility).toBe("restricted")
  })
})

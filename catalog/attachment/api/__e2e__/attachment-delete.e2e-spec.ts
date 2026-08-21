import request from "supertest"

import { createE2eApp } from "../../../../test/setup/app-factory"
import { setCookies } from "../../../../test/setup/cookies"
import {
  createTestPool,
  seedEmail,
  truncateAttachment,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { RATE_LIMITER } from "../../identity/domain/ports/rate-limiter"
import { allowAllRateLimiter } from "../../identity/testing/allow-all-rate-limiter"
import { seedUser } from "../../identity/testing/seed-user"
import { ATTACHMENT_ACCESS_LOG_REPOSITORY } from "../domain/ports/attachment-access-log.repository"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"
import type { AttachmentAccessLogRepository } from "../domain/ports/attachment-access-log.repository"
import type { INestApplication } from "@nestjs/common"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Att-Delete-Muito-Forte-2026!"

// 1x1 PNG válido (assinatura 0x89 'PNG').
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
)

function makeInMemoryStorage(): ObjectStoragePort {
  const objects = new Map<string, { body: Buffer; contentType: string }>()
  return {
    put: (key, body, contentType) => {
      objects.set(key, { body, contentType })
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

/**
 * Exercita `DeleteAttachmentUseCase` pelo único caminho de produção que a
 * dispara sem endpoint HTTP dedicado: substituir o avatar do usuário chama
 * `AttachmentFacade.delete(previousAvatarId)` (ver `UploadAvatarUseCase`).
 */
describe("Attachment delete (e2e): trilha atrelada à tx", () => {
  let app: INestApplication
  let pool: Pool
  let storage: ObjectStoragePort

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200)
    return setCookies(res)
  }

  async function uploadAvatar(cookie: string[]): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/avatar")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .attach("file", PNG_1PX, { filename: "avatar.png", contentType: "image/png" })
      .expect(200)
    return res.body.avatarAttachmentId as string
  }

  async function deleteLogRows(attachmentId: string) {
    const { rows } = await pool.query<{ action: string; outcome: string; user_id: string }>(
      "SELECT action, outcome, user_id FROM attachment.attachment_access_logs WHERE attachment_id = $1 AND action = 'delete'",
      [attachmentId],
    )
    return rows
  }

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateAttachment(pool)

    storage = makeInMemoryStorage()
    app = await createE2eApp((b) =>
      b
        .overrideProvider(RATE_LIMITER)
        .useValue(allowAllRateLimiter)
        .overrideProvider(OBJECT_STORAGE)
        .useValue(storage),
    )
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  it("exclusão que commita deixa exatamente uma linha action='delete', outcome='allowed'", async () => {
    const email = seedEmail("attachment-delete", "commit")
    const userId = await seedUser(app, pool, { email, password: PASSWORD })
    const cookie = await login(email)

    const firstAvatarId = await uploadAvatar(cookie)
    await uploadAvatar(cookie) // substitui o avatar anterior → dispara o delete

    const rows = await deleteLogRows(firstAvatarId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: "delete", outcome: "allowed", user_id: userId })

    const { rows: attachmentRows } = await pool.query<{ status: string }>(
      "SELECT status FROM attachment.attachments WHERE id = $1",
      [firstAvatarId],
    )
    expect(attachmentRows[0]?.status).toBe("deleted")
  })

  it("exclusão com rollback forçado não deixa linha (nem soft-delete)", async () => {
    const email = seedEmail("attachment-delete", "rollback")
    await seedUser(app, pool, { email, password: PASSWORD })
    const cookie = await login(email)

    const accessLog = app.get<AttachmentAccessLogRepository>(ATTACHMENT_ACCESS_LOG_REPOSITORY)
    const originalRecordInTx = accessLog.recordInTx.bind(accessLog)
    const spy = jest
      .spyOn(accessLog, "recordInTx")
      .mockImplementation(async (entry) => {
        await originalRecordInTx(entry) // a linha É gravada na tx…
        throw new Error("falha forçada pelo teste após gravar a trilha")
      })

    try {
      const firstAvatarId = await uploadAvatar(cookie)
      // UploadAvatarUseCase trata a limpeza do avatar antigo como melhor-esforço:
      // o erro do delete não deve derrubar a troca de avatar.
      await uploadAvatar(cookie)

      const rows = await deleteLogRows(firstAvatarId)
      expect(rows).toHaveLength(0) // …mas o rollback da tx desfaz o insert

      const { rows: attachmentRows } = await pool.query<{ status: string }>(
        "SELECT status FROM attachment.attachments WHERE id = $1",
        [firstAvatarId],
      )
      expect(attachmentRows[0]?.status).toBe("ready") // soft-delete também desfeito
    } finally {
      spy.mockRestore()
    }
  })
})

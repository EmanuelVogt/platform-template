import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { cookieHeader as setCookies } from "../../../shared/test/e2e/http"
import { resetDb } from "../../../shared/test/int/db"
import { seedEmail, seedUser } from "../../identity/testing"
import { ATTACHMENT_ACCESS_LOG_REPOSITORY } from "../domain/ports/attachment-access-log.repository"
import { inMemoryStorage, PNG_1PX } from "../testing"

import type { AttachmentAccessLogRepository } from "../domain/ports/attachment-access-log.repository"
import type { InMemoryStorage } from "../testing"
import type { INestApplication } from "@nestjs/common"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Att-Delete-Muito-Forte-2026!"

/**
 * Exercita `DeleteAttachmentUseCase` pelo único caminho de produção que a
 * dispara sem endpoint HTTP dedicado: substituir o avatar do usuário chama
 * `AttachmentFacade.delete(previousAvatarId)` (ver `UploadAvatarUseCase`).
 */
describe("Attachment delete (e2e): trilha atrelada à tx", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let storage: InMemoryStorage

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
      .attach("file", PNG_1PX, {
        filename: "avatar.png",
        contentType: "image/png",
      })
      .expect(200)
    return res.body.avatarAttachmentId as string
  }

  async function deleteLogRows(attachmentId: string) {
    const { rows } = await pool.query<{
      action: string
      outcome: string
      user_id: string
    }>(
      "SELECT action, outcome, user_id FROM attachment.attachment_access_logs WHERE attachment_id = $1 AND action = 'delete'",
      [attachmentId]
    )
    return rows
  }

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])

    storage = inMemoryStorage()
    app = (await createE2eApp({ overrides: [[OBJECT_STORAGE, storage]] })).app
  })

  afterAll(async () => {
    await app.close()
  })

  it("exclusão que commita deixa exatamente uma linha action='delete', outcome='allowed'", async () => {
    const email = seedEmail("attachment-delete", "commit")
    const userId = await seedUser(app, pool, { email, password: PASSWORD })
    const cookie = await login(email)

    const firstAvatarId = await uploadAvatar(cookie)
    await uploadAvatar(cookie) // substitui o avatar anterior → dispara o delete

    const rows = await deleteLogRows(firstAvatarId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: "delete",
      outcome: "allowed",
      user_id: userId,
    })

    const { rows: attachmentRows } = await pool.query<{ status: string }>(
      "SELECT status FROM attachment.attachments WHERE id = $1",
      [firstAvatarId]
    )
    expect(attachmentRows[0]?.status).toBe("deleted")
  })

  it("exclusão com rollback forçado não deixa linha (nem soft-delete)", async () => {
    const email = seedEmail("attachment-delete", "rollback")
    await seedUser(app, pool, { email, password: PASSWORD })
    const cookie = await login(email)

    const accessLog = app.get<AttachmentAccessLogRepository>(
      ATTACHMENT_ACCESS_LOG_REPOSITORY
    )
    const originalRecordInTx = accessLog.recordInTx.bind(accessLog)
    const spy = vi
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
        [firstAvatarId]
      )
      expect(attachmentRows[0]?.status).toBe("ready") // soft-delete também desfeito
    } finally {
      spy.mockRestore()
    }
  })
})

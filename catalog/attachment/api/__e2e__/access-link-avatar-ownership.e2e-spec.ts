import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { OutboxDispatcher } from "../../../shared/kernel/outbox/outbox.dispatcher"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { resetDb } from "../../../shared/test/int/db"
import { fakeMailer, seedEmail, seedUser } from "../../identity/testing"
import { MAILER } from "../../notification/domain/ports/mailer"
import { inMemoryStorage, PNG_1PX } from "../testing"

import type { EmailMessage } from "../../notification/domain/ports/mailer"
import type { INestApplication } from "@nestjs/common"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const MASTER_PASSWORD = "Senha-Master-Muito-Forte-2026!"

/** Extrai o href renderizado no botão de ação do e-mail (link com token). */
function linkFromHtml(html: string): string {
  const match = /href="([^"]+)"/.exec(html)
  if (!match) throw new Error("link não encontrado no e-mail")
  return match[1]!
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout esperando a condição")
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/**
 * SPEC_DEVIATION: teste movido de catalog/identity/single-tenant para cá.
 * Reason: exercita POST /v1/auth/access-link/avatar, que só resolve
 * PROFILE_IMAGE_STORE quando o módulo attachment está instalado (a porta é
 * @Optional() em UploadAccessLinkAvatarUseCase, ligada pelo attachment) — o
 * e2e cruzado fica na entrada a jusante da dependência (attachment depende de
 * identity), nunca na entrada dependida, mesmo critério do comentário de
 * testing/fake-mailer.ts para os cruzados identity ↔ notification. Descoberto
 * pelo gate de DB tier por entrada (AC3) rodando pela 1ª vez em
 * catalog:check identity (Deviation 16, ADV-20260821-03).
 */
describe("Access-link avatar (e2e): ownership entre identity e attachment", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let mailer: ReturnType<typeof fakeMailer>
  let dispatcher: OutboxDispatcher

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])

    mailer = fakeMailer()
    app = (
      await createE2eApp({
        overrides: [
          [MAILER, mailer],
          [OBJECT_STORAGE, inMemoryStorage()],
        ],
      })
    ).app
    dispatcher = app.get(OutboxDispatcher)
  })

  afterAll(async () => {
    await app.close()
  })

  /** Helper: convida usuário e extrai o token do fakeMailer após poll do outbox. */
  async function inviteUser(
    masterCookie: string[],
    email: string,
    name: string,
    idempotencyKey: string
  ): Promise<string> {
    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        name,
        email,
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)

    await dispatcher.poll()
    const sentTo = (): EmailMessage | undefined =>
      mailer.sent.find((message) => message.to === email)
    await waitFor(() => sentTo() !== undefined)

    const token = new URL(linkFromHtml(sentTo()!.html)).searchParams.get(
      "token"
    )
    expect(token).toBeTruthy()
    return token!
  }

  it("avatar de OUTRO user é rejeitado (não persiste) na ativação", async () => {
    const masterEmail = seedEmail("access-link-avatar", "master")
    await seedUser(app, pool, {
      email: masterEmail,
      name: "Master",
      password: MASTER_PASSWORD,
      accessProfile: "master",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: masterEmail, password: MASTER_PASSWORD })
      .expect(200)
    const masterCookie = loginRes.headers["set-cookie"] as unknown as string[]

    // Convidar Dani para obter token pré-auth e fazer upload como Dani.
    const daniEmail = seedEmail("access-link-avatar", "dani")
    const daniToken = await inviteUser(
      masterCookie,
      daniEmail,
      "Dani",
      "invite-dani-act"
    )

    // Upload de avatar usando o token pré-auth de Dani (ownerUserId = Dani).
    const uploadRes = await request(app.getHttpServer())
      .post("/v1/auth/access-link/avatar")
      .set("Origin", ORIGIN)
      .attach("file", PNG_1PX, {
        filename: "avatar.png",
        contentType: "image/png",
      })
      .field("token", daniToken)
      .expect(201)
    const foreignId = uploadRes.body.attachmentId as string
    expect(foreignId).toBeTruthy()

    const cleoEmail = seedEmail("access-link-avatar", "cleo")
    const cleoToken = await inviteUser(
      masterCookie,
      cleoEmail,
      "Cleo",
      "invite-cleo-act"
    )

    // Tentar ativar Cleo com o attachmentId dono de Dani → ownership check rejeita.
    const setRes = await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token: cleoToken,
        name: "Cleo",
        birthDate: "2000-01-15",
        password: "Senha-Cleo-Muito-Forte-2026!",
        avatarAttachmentId: foreignId,
      })
      .expect(200)
    expect(setRes.body.user).toMatchObject({ email: cleoEmail })

    // No banco: avatar_attachment_id de Cleo deve ser NULL.
    const { rows } = await pool.query<{ avatar_attachment_id: string | null }>(
      "SELECT avatar_attachment_id FROM identity.users WHERE email = $1",
      [cleoEmail]
    )
    expect(rows[0]?.avatar_attachment_id).toBeNull()
  })
})

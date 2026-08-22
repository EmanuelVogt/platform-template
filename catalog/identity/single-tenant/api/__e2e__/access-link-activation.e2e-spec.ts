import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createTestPool,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { OutboxDispatcher } from "../../../shared/kernel/outbox/outbox.dispatcher"
import { MAILER } from "../../notification/domain/ports/mailer"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { fakeMailer } from "../testing/fake-mailer"
import { seedUser } from "../testing/seed-user"

import type { EmailMessage } from "../../notification/domain/ports/mailer"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

/** Extrai o href renderizado no botão de ação do e-mail (link com token). */
function linkFromHtml(html: string): string {
  const match = /href="([^"]+)"/.exec(html)
  if (!match) throw new Error("link não encontrado no e-mail")
  return match[1]!
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout esperando a condição")
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe("Ativação via access-link (e2e)", () => {
  let app: INestApplication
  let dispatcher: OutboxDispatcher
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    mailer = fakeMailer()
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
    dispatcher = app.get(OutboxDispatcher)
  })

  afterAll(async () => {
    await app.close()
  })

  /** Helper: cria master, faz login, retorna cookie de sessão. */
  async function setupMaster(email: string): Promise<string[]> {
    const pool = createTestPool()
    const masterId = await seedUser(app, pool, {
      email,
      name: "Master",
      password: "Senha-Master-Muito-Forte-2026!",
    })
    // Índice único permite UM master por banco — demove o anterior antes de promover.
    await pool.query(
      "UPDATE identity.users SET access_profile = 'admin' WHERE access_profile = 'master'",
    )
    await pool.query("UPDATE identity.users SET access_profile = 'master' WHERE id = $1", [masterId])
    await pool.end()

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password: "Senha-Master-Muito-Forte-2026!" })
      .expect(200)
    return loginRes.headers["set-cookie"] as unknown as string[]
  }

  /** Helper: convida usuário e extrai o token do fakeMailer após poll do outbox. */
  async function inviteUser(
    masterCookie: string[],
    email: string,
    name: string,
    idempotencyKey: string,
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
    // Casa pelo destinatário, não por índice: um envio alheio no mesmo run
    // deslocaria a posição e o teste leria o token de outro convidado.
    const sentTo = (): EmailMessage | undefined =>
      mailer.sent.find((message) => message.to === email)
    await waitFor(() => sentTo() !== undefined)

    const token = new URL(linkFromHtml(sentTo()!.html)).searchParams.get("token")
    expect(token).toBeTruthy()
    return token!
  }

  it("ativa a conta (200 + cookie + sessão + birth_date) e mata o token", async () => {
    const masterCookie = await setupMaster("master-act1@example.com")
    const token = await inviteUser(masterCookie, "ana-act@example.com", "Ana", "invite-ana-act")

    // Pré-validação pública: retorna nome, e-mail e sem avatar.
    const info = await request(app.getHttpServer())
      .get("/v1/auth/access-link")
      .query({ token })
      .expect(200)
    expect(info.body).toEqual({
      name: "Ana",
      email: "ana-act@example.com",
      avatarAttachmentId: null,
    })

    // Ativação: define nome completo, data de nascimento e senha.
    const setRes = await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token,
        name: "Ana Maria",
        birthDate: "1990-05-20",
        password: "Senha-Ana-Muito-Forte-2026!",
      })
      .expect(200)
    expect(setRes.body.user).toMatchObject({ name: "Ana Maria", email: "ana-act@example.com" })
    const anaCookie = setRes.headers["set-cookie"]
    expect(anaCookie).toBeDefined()

    // Cookie de ativação autentica direto na sessão.
    await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Cookie", anaCookie!)
      .expect(200)

    // Verifica no banco: status active, birth_date e exatamente 1 sessão.
    const pool = createTestPool()
    const { rows } = await pool.query<{
      status: string
      birth_date: string | Date | null
    }>(
      "SELECT status, birth_date FROM identity.users WHERE email = $1",
      ["ana-act@example.com"],
    )
    expect(rows[0]?.status).toBe("active")
    // birth_date pode vir como Date (driver pg) ou string; normaliza pra string ISO.
    const bd = rows[0]?.birth_date
    const bdStr = bd instanceof Date ? bd.toISOString().slice(0, 10) : String(bd).slice(0, 10)
    expect(bdStr).toBe("1990-05-20")

    const { rows: sessions } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id WHERE u.email = $1",
      ["ana-act@example.com"],
    )
    expect(Number(sessions[0]?.count)).toBe(1)
    await pool.end()

    // Reuso do token já consumido → 400.
    await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token,
        name: "Ana",
        birthDate: "1990-05-20",
        password: "Outra-Senha-Forte-2026!",
      })
      .expect(400)
  })

  it("recusar convite invalida o token; user segue pending", async () => {
    const masterCookie = await setupMaster("master-act2@example.com")
    const token = await inviteUser(masterCookie, "bia-act@example.com", "Bia", "invite-bia-act")

    // Cancelar o access-link.
    await request(app.getHttpServer())
      .post("/v1/auth/access-link/cancel")
      .set("Origin", ORIGIN)
      .send({ token })
      .expect(204)

    // Verifica no banco: status permanece pending.
    const pool = createTestPool()
    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM identity.users WHERE email = $1",
      ["bia-act@example.com"],
    )
    expect(rows[0]?.status).toBe("pending")
    await pool.end()

    // Tentativa de ativar com token cancelado → 400.
    await request(app.getHttpServer())
      .post("/v1/auth/set-password")
      .set("Origin", ORIGIN)
      .send({
        token,
        name: "Bia",
        birthDate: "1995-03-10",
        password: "Senha-Bia-Muito-Forte-2026!",
      })
      .expect(400)
  })

  // SPEC_DEVIATION: o teste "avatar de OUTRO user é rejeitado" saiu daqui.
  // Reason: exercitava POST /v1/auth/access-link/avatar, que só resolve
  // PROFILE_IMAGE_STORE quando o módulo attachment está instalado (a porta é
  // @Optional() em UploadAccessLinkAvatarUseCase) — nunca o caso num
  // `catalog:check identity` standalone (identity não depende de attachment;
  // é o contrário). O gate de DB tier por entrada (AC3) rodou pela 1ª vez e
  // expôs a suposição, mesma categoria da Deviation 16 (ADV-20260821-04). Vai
  // para o e2e da entrada attachment (T25), que declara `dependsOn identity`
  // e por isso tem os dois módulos presentes.
})

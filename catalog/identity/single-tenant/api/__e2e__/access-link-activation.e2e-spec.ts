import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader } from "../../../shared/test/e2e/http"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import {
  fakeMailer,
  loginAs,
  seedUser,
  TEST_PASSWORD,
  tokenFromMail,
} from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

describe("Ativação via access-link (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    mailer = fakeMailer()
    e2e = await createE2eApp({ overrides: [[MAILER, mailer]] })
  })

  afterAll(async () => {
    await e2e.close()
  })

  /** Cria o master (o seed rebaixa o anterior), faz login e devolve os cookies. */
  async function setupMaster(email: string): Promise<string[]> {
    await seedUser(e2e.app, db.pool, {
      email,
      name: "Master",
      password: TEST_PASSWORD,
      accessProfile: "master",
    })
    return loginAs(e2e.http, email)
  }

  /** Convida o usuário e extrai o token do fakeMailer depois de girar o outbox. */
  async function inviteUser(
    masterCookies: string[],
    email: string,
    name: string,
    idempotencyKey: string
  ): Promise<string> {
    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookies)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        name,
        email,
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)

    // Casa pelo destinatário, não por índice: um envio alheio no mesmo run
    // deslocaria a posição e o teste leria o token de outro convidado.
    await drainOutbox(e2e.app, {
      until: () => mailer.sent.find((message) => message.to === email),
    })
    return tokenFromMail(mailer, email)
  }

  it("ativa a conta (200 + cookie + sessão + birth_date) e mata o token", async () => {
    const masterCookies = await setupMaster("master-act1@example.com")
    const token = await inviteUser(
      masterCookies,
      "ana-act@example.com",
      "Ana",
      "invite-ana-act"
    )

    // Pré-validação pública: retorna nome, e-mail e sem avatar.
    const info = await e2e.http
      .get("/v1/auth/access-link")
      .query({ token })
      .expect(200)
    expect(info.body).toEqual({
      name: "Ana",
      email: "ana-act@example.com",
      avatarAttachmentId: null,
    })

    // Ativação: define nome completo, data de nascimento e senha.
    const setRes = await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Ana Maria",
        password: "Senha-Ana-Muito-Forte-2026!",
      })
      .expect(200)
    expect(setRes.body.user).toMatchObject({
      name: "Ana Maria",
      email: "ana-act@example.com",
    })
    const anaCookies = cookieHeader(setRes)
    expect(anaCookies.length).toBeGreaterThan(0)

    // Cookie de ativação autentica direto na sessão.
    await e2e.http.get("/v1/auth/session").set("Cookie", anaCookies).expect(200)

    // Verifica no banco: status active, birth_date e exatamente 1 sessão.
    const { rows } = await db.pool.query<{
      status: string
      birth_date: string | Date | null
    }>("SELECT status, birth_date FROM identity.users WHERE email = $1", [
      "ana-act@example.com",
    ])
    expect(rows[0]?.status).toBe("active")
    // birth_date pode vir como Date (driver pg) ou string; normaliza pra string ISO.
    const bd = rows[0]?.birth_date
    const bdStr =
      bd instanceof Date
        ? bd.toISOString().slice(0, 10)
        : String(bd).slice(0, 10)
    expect(bdStr).toBe("1990-05-20")

    const { rows: sessions } = await db.pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id WHERE u.email = $1",
      ["ana-act@example.com"]
    )
    expect(Number(sessions[0]?.count)).toBe(1)

    // Reuso do token já consumido → 400.
    await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Ana",
        password: "Outra-Senha-Forte-2026!",
      })
      .expect(400)
  })

  it("recusar convite invalida o token; user segue pending", async () => {
    const masterCookies = await setupMaster("master-act2@example.com")
    const token = await inviteUser(
      masterCookies,
      "bia-act@example.com",
      "Bia",
      "invite-bia-act"
    )

    // Cancelar o access-link.
    await e2e.http
      .post("/v1/auth/access-link/cancel")
      .set("Origin", E2E_ORIGIN)
      .send({ token })
      .expect(204)

    // Verifica no banco: status permanece pending.
    const { rows } = await db.pool.query<{ status: string }>(
      "SELECT status FROM identity.users WHERE email = $1",
      ["bia-act@example.com"]
    )
    expect(rows[0]?.status).toBe("pending")

    // Tentativa de ativar com token cancelado → 400.
    await e2e.http
      .post("/v1/auth/set-password")
      .set("Origin", E2E_ORIGIN)
      .send({
        token,
        name: "Bia",
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

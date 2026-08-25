import request from "supertest"
import {
  type Mock,
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { resetDb } from "../../../shared/test/int/db"
import { seedUser } from "../../identity/testing"
import { UploadGate } from "../api/controllers/multipart-files"
import { parseAttachmentConfig } from "../attachment.config"
import { inMemoryStorage, PNG_1PX } from "../testing"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"
import type { INestApplication } from "@nestjs/common"
import type { Readable } from "node:stream"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"

const HTML_BYTES = Buffer.from("<html><body>não é imagem</body></html>")

describe("Attachment (e2e): upload em lote", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])

    app = (
      await createE2eApp({ overrides: [[OBJECT_STORAGE, inMemoryStorage()]] })
    ).app
  })

  afterAll(async () => {
    await app.close()
  })

  async function loginNewUser(email: string): Promise<string[]> {
    await seedUser(app, pool, {
      email,
      name: "Upload",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    return res.headers["set-cookie"] as unknown as string[]
  }

  it("sobe uma imagem válida no perfil 'image' (200, um upload devolvido)", async () => {
    const cookies = await loginNewUser("att-up-ok@example.com")

    const res = await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .set("Origin", ORIGIN)
      .set("Cookie", cookies)
      .attach("file", PNG_1PX, {
        filename: "avatar.png",
        contentType: "image/png",
      })
      .expect(201)

    expect(res.body.uploads).toHaveLength(1)
    expect(typeof res.body.uploads[0].attachmentId).toBe("string")
  })

  // REM-08: bytes html declarados como image/png não sobrevivem ao sniff — a
  // prova de que a decisão é pelos magic bytes, nunca pelo Content-Type que o
  // cliente escolhe mandar.
  it("recusa bytes text/html declarados como image/png (415, nada persistido)", async () => {
    const cookies = await loginNewUser("att-up-spoof@example.com")

    const res = await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .set("Origin", ORIGIN)
      .set("Cookie", cookies)
      .attach("file", HTML_BYTES, {
        filename: "fake.png",
        contentType: "image/png",
      })
      .expect(415)

    expect(res.body.type).toMatch(/\/unsupported-media-type$/)
  })

  // REM-08 (mutant 2): imagem válida cujo tipo farejado difere do declarado
  // também é 415 — não só o sniff nulo (html) do teste acima.
  it("recusa PNG válido declarado como image/jpeg (415, nada persistido)", async () => {
    const cookies = await loginNewUser("att-up-swapped@example.com")

    const res = await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .set("Origin", ORIGIN)
      .set("Cookie", cookies)
      .attach("file", PNG_1PX, {
        filename: "swapped.png",
        contentType: "image/jpeg",
      })
      .expect(415)

    expect(res.body.type).toMatch(/\/unsupported-media-type$/)
  })

  it("recusa upload sem sessão (401/403 — rota exige actor)", async () => {
    await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .attach("file", PNG_1PX, {
        filename: "avatar.png",
        contentType: "image/png",
      })
      .expect((res) => {
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`esperava 401 ou 403, veio ${String(res.status)}`)
        }
      })
  })
})

async function loginUser(
  app: INestApplication,
  pool: Pool,
  email: string
): Promise<string[]> {
  await seedUser(app, pool, {
    email,
    name: "Upload",
    password: "Senha-Att-Muito-Forte-2026!",
  })
  const res = await request(app.getHttpServer())
    .post("/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: "Senha-Att-Muito-Forte-2026!" })
    .expect(200)
  return res.headers["set-cookie"] as unknown as string[]
}

// REM-14: as três cotas de upload — este bloco pede `rateLimiter: "real"`
// pra provar a wiring do `@RateLimit` na rota; os outros dois blocos ficam no
// allow-all (default do harness) pra isolar cada cota sem o 429 interferir.
describe("Attachment (e2e): limite de requisições por IP (429)", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let putStream: Mock

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])

    const base = inMemoryStorage()
    putStream = vi.fn((key: string, body: Readable, contentType: string) =>
      base.putStream(key, body, contentType)
    )
    const storage = { ...base, putStream } as unknown as ObjectStoragePort

    app = (
      await createE2eApp({
        rateLimiter: "real",
        overrides: [[OBJECT_STORAGE, storage]],
      })
    ).app
  })

  afterAll(async () => {
    await app.close()
  })

  it("estoura o limite de 20 requisições/60s por IP na 21ª (429, Retry-After, corpo não consumido)", async () => {
    const cookies = await loginUser(app, pool, "att-up-429@example.com")

    let lastStatus = 0
    let lastRetryAfter: string | undefined
    for (let i = 0; i < 21; i++) {
      const res = await request(app.getHttpServer())
        .post("/v1/attachments/uploads")
        .query({ profile: "image" })
        .set("Origin", ORIGIN)
        .set("Cookie", cookies)
        .attach("file", PNG_1PX, {
          filename: `f${String(i)}.png`,
          contentType: "image/png",
        })
      lastStatus = res.status
      lastRetryAfter = res.headers["retry-after"]
    }

    expect(lastStatus).toBe(429)
    expect(lastRetryAfter).toBeDefined()
    // 21 pedidos, só os 20 primeiros passam do guard de rate-limit.
    expect(putStream).toHaveBeenCalledTimes(20)
  })
})

describe("Attachment (e2e): cota de bytes pendentes do dono (413)", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let putStream: Mock

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])

    const base = inMemoryStorage()
    putStream = vi.fn((key: string, body: Readable, contentType: string) =>
      base.putStream(key, body, contentType)
    )
    const storage = { ...base, putStream } as unknown as ObjectStoragePort

    app = (await createE2eApp({ overrides: [[OBJECT_STORAGE, storage]] })).app
  })

  afterAll(async () => {
    await app.close()
  })

  it("recusa com 413 quando pendentes do dono + Content-Length estourariam a cota, sem ler o corpo", async () => {
    const email = "att-up-413@example.com"
    const cookies = await loginUser(app, pool, email)
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM identity.users WHERE email = $1",
      [email]
    )
    const ownerId = rows[0]!.id

    // Duas linhas pendentes somando acima da cota (2 GiB) — cada uma dentro
    // do teto do int4 da coluna, a soma (bigint no SUM) é o que estoura.
    for (const [i, key] of ["pending-1", "pending-2"].entries()) {
      await pool.query(
        `INSERT INTO attachment.attachments
           (id, storage_key, content_type, size_bytes, profile, owner_user_id, status)
         VALUES ($1, $2, 'image/png', 1100000000, 'image', $3, 'pending')`,
        [`att-413-${String(i)}`, key, ownerId]
      )
    }

    const res = await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .set("Origin", ORIGIN)
      .set("Cookie", cookies)
      .attach("file", PNG_1PX, {
        filename: "over-quota.png",
        contentType: "image/png",
      })
      .expect(413)

    expect(res.body.type).toMatch(/\/pending-quota-exceeded$/)
    expect(putStream).not.toHaveBeenCalled()
  })
})

describe("Attachment (e2e): limite de uploads em voo na instância (503)", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let putStream: Mock
  let gate: UploadGate

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])

    const base = inMemoryStorage()
    putStream = vi.fn((key: string, body: Readable, contentType: string) =>
      base.putStream(key, body, contentType)
    )
    const storage = { ...base, putStream } as unknown as ObjectStoragePort
    gate = new UploadGate(
      parseAttachmentConfig({ ATTACHMENT_MAX_CONCURRENT_UPLOADS: "1" })
    )

    app = (
      await createE2eApp({
        overrides: [
          [OBJECT_STORAGE, storage],
          [UploadGate, gate],
        ],
      })
    ).app
  })

  afterAll(async () => {
    await app.close()
  })

  it("recusa com 503 quando não há vaga de upload concorrente na instância, sem ler o corpo", async () => {
    const cookies = await loginUser(app, pool, "att-up-503@example.com")
    // Ocupa a única vaga da instância antes do pedido — simula o cap
    // atingido sem depender de corrida real entre requisições.
    const release = gate.tryAcquire()
    expect(release).not.toBeNull()

    const res = await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .set("Origin", ORIGIN)
      .set("Cookie", cookies)
      .attach("file", PNG_1PX, {
        filename: "saturated.png",
        contentType: "image/png",
      })
      .expect(503)

    expect(res.body.type).toMatch(/\/uploads-saturated$/)
    expect(res.headers["retry-after"]).toBeDefined()
    expect(putStream).not.toHaveBeenCalled()
  })
})

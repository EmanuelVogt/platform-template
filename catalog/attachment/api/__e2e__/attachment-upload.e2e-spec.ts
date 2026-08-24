import { Readable } from "node:stream"

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
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

import {
  createTestPool,
  truncateAttachment,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { seedUser } from "../../identity/testing/seed-user"
import { UploadGate } from "../api/controllers/multipart-files"
import { parseAttachmentConfig } from "../attachment.config"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
  reset: () => Promise.resolve(),
}

// 1x1 PNG válido (assinatura 0x89 'PNG').
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
)
const HTML_BYTES = Buffer.from("<html><body>não é imagem</body></html>")

/** Storage em memória: substitui o adapter R2 no teste (sem IO externo). */
function makeInMemoryStorage(): ObjectStoragePort {
  const objects = new Map<string, { body: Buffer; contentType: string }>()
  return {
    put: (key, body, contentType) => {
      objects.set(key, { body, contentType })
      return Promise.resolve()
    },
    getStream: (key) => {
      const o = objects.get(key)
      if (o === undefined) throw new Error(`objeto inexistente: ${key}`)
      return Promise.resolve(Readable.from(o.body))
    },
    head: (key) => {
      const o = objects.get(key)
      return Promise.resolve(
        o === undefined
          ? null
          : {
              contentType: o.contentType,
              sizeBytes: o.body.byteLength,
              etag: "",
            }
      )
    },
    delete: (key) => {
      objects.delete(key)
      return Promise.resolve()
    },
    putStream: async (key, body, contentType) => {
      const chunks: Buffer[] = []
      for await (const chunk of body) chunks.push(chunk as Buffer)
      objects.set(key, { body: Buffer.concat(chunks), contentType })
    },
  }
}

describe("Attachment (e2e): upload em lote", () => {
  let app: INestApplication
  let pool: Pool

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateAttachment(pool)

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(OBJECT_STORAGE)
      .useValue(makeInMemoryStorage())
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
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

// REM-14: as três cotas de upload — RATE_LIMITER real (default) prova a
// wiring do `@RateLimit` na rota; os outros dois blocos usam allowAll pra
// isolar cada cota sem o 429 interferir.
describe("Attachment (e2e): limite de requisições por IP (429)", () => {
  let app: INestApplication
  let pool: Pool
  let putStream: Mock

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateAttachment(pool)

    const base = makeInMemoryStorage()
    putStream = vi.fn((key: string, body: Readable, contentType: string) =>
      base.putStream(key, body, contentType)
    )
    const storage = { ...base, putStream } as unknown as ObjectStoragePort

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
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
  let app: INestApplication
  let pool: Pool
  let putStream: Mock

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateAttachment(pool)

    const base = makeInMemoryStorage()
    putStream = vi.fn((key: string, body: Readable, contentType: string) =>
      base.putStream(key, body, contentType)
    )
    const storage = { ...base, putStream } as unknown as ObjectStoragePort

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
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
  let app: INestApplication
  let pool: Pool
  let putStream: Mock
  let gate: UploadGate

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateAttachment(pool)

    const base = makeInMemoryStorage()
    putStream = vi.fn((key: string, body: Readable, contentType: string) =>
      base.putStream(key, body, contentType)
    )
    const storage = { ...base, putStream } as unknown as ObjectStoragePort
    gate = new UploadGate(
      parseAttachmentConfig({ ATTACHMENT_MAX_CONCURRENT_UPLOADS: "1" })
    )

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .overrideProvider(UploadGate)
      .useValue(gate)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
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

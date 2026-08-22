import http from "node:http"
import { Readable } from "node:stream"

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { ulid } from "ulid"

import {
  createTestPool,
  truncateAttachment,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { loadEnv } from "../../../shared/config/env"
import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { seedUser } from "../../identity/testing/seed-user"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"
import type { Server } from "node:http"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

// 1x1 PNG válido (assinatura 0x89 'PNG').
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
)

/**
 * Storage em memória: substitui o adapter R2 no teste (sem IO externo).
 * `getStream` conta chamadas — o que prova que 304 nunca toca o storage.
 */
function makeInMemoryStorage(): {
  storage: ObjectStoragePort
  getStreamCallCount: () => number
} {
  const objects = new Map<string, { body: Buffer; contentType: string }>()
  let callCount = 0
  const storage: ObjectStoragePort = {
    put: (key, body, contentType) => {
      objects.set(key, { body, contentType })
      return Promise.resolve()
    },
    getStream: (key) => {
      callCount += 1
      const o = objects.get(key)
      if (o === undefined) throw new Error(`objeto inexistente: ${key}`)
      return Promise.resolve(Readable.from(o.body))
    },
    head: (key) => {
      const o = objects.get(key)
      return Promise.resolve(
        o === undefined
          ? null
          : { contentType: o.contentType, sizeBytes: o.body.byteLength, etag: "" },
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
  return { storage, getStreamCallCount: () => callCount }
}

/** Storage cujo `getStream` recusa passar de `maxSockets` chamadas simultâneas. */
function makeSocketLimitedStorage(base: ObjectStoragePort, maxSockets: number): ObjectStoragePort {
  const originalGetStream = base.getStream.bind(base)
  let inFlight = 0
  return {
    ...base,
    getStream: async (key) => {
      if (inFlight >= maxSockets) throw new Error("sem socket livre")
      inFlight += 1
      try {
        return await originalGetStream(key)
      } finally {
        inFlight -= 1
      }
    },
  }
}

/** Semeia attachment 'ready' + ACL direto no banco (não há mais rota de upload). */
async function seedAttachment(
  pool: Pool,
  storage: ObjectStoragePort,
  opts: {
    ownerUserId: string
    visibility: "public" | "authenticated" | "restricted"
    profile?: string
    originalFilename?: string
    contentType?: string
  },
): Promise<string> {
  const id = ulid()
  const storageKey = `e2e/${id}.png`
  const profile = opts.profile ?? "legacy"
  const originalFilename = opts.originalFilename ?? "avatar.png"
  const contentType = opts.contentType ?? "image/png"
  await storage.put(storageKey, PNG_1PX, contentType)
  await pool.query(
    `insert into attachment.attachments
       (id, storage_key, content_type, size_bytes, checksum, original_filename, owner_user_id, status, profile)
     values ($1, $2, $3, $4, 'checksum-e2e', $5, $6, 'ready', $7)`,
    [id, storageKey, contentType, PNG_1PX.byteLength, originalFilename, opts.ownerUserId, profile],
  )
  await pool.query(
    "insert into attachment.attachment_acls (attachment_id, visibility) values ($1, $2)",
    [id, opts.visibility],
  )
  return id
}

describe("Attachment (e2e): download com ACL", () => {
  let app: INestApplication
  let pool: Pool
  let storage: ObjectStoragePort
  let getStreamCallCount: () => number

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateAttachment(pool)

    ;({ storage, getStreamCallCount } = makeInMemoryStorage())
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

  it("recurso 'authenticated': download com sessão 200, sem sessão 404, access log registra", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-dl@example.com",
      name: "Ana",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-dl@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookie = loginRes.headers["set-cookie"]

    const attachmentId = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "authenticated",
    })

    const okRes = await request(app.getHttpServer())
      .get(`/v1/attachments/${attachmentId}`)
      .set("Cookie", cookie!)
      .expect(200)
    expect(okRes.headers["content-type"]).toContain("image/png")

    // Sem sessão → 404 (sem vazar existência).
    await request(app.getHttpServer())
      .get(`/v1/attachments/${attachmentId}`)
      .expect(404)

    const { rows } = await pool.query<{ action: string; outcome: string }>(
      "SELECT action, outcome FROM attachment.attachment_access_logs WHERE attachment_id = $1",
      [attachmentId],
    )
    const outcomes = rows.map((r) => `${r.action}/${r.outcome}`)
    expect(outcomes).toContain("download/allowed")
    expect(outcomes).toContain("download/denied")
  })

  it("recurso 'restricted': só o dono baixa; outro autenticado recebe 404", async () => {
    const ownerId = await seedUser(app, pool, {
      email: "att-owner@example.com",
      name: "Dona",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    await seedUser(app, pool, {
      email: "att-other@example.com",
      name: "Outro",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const ownerLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-owner@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const otherLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-other@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)

    const attachmentId = await seedAttachment(pool, storage, {
      ownerUserId: ownerId,
      visibility: "restricted",
    })

    await request(app.getHttpServer())
      .get(`/v1/attachments/${attachmentId}`)
      .set("Cookie", ownerLogin.headers["set-cookie"]!)
      .expect(200)
    await request(app.getHttpServer())
      .get(`/v1/attachments/${attachmentId}`)
      .set("Cookie", otherLogin.headers["set-cookie"]!)
      .expect(404)
  })

  it("content_type fora do allowlist inline força octet-stream + nosniff, independente do perfil", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-force-dl@example.com",
      name: "Force",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-force-dl@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookies = loginRes.headers["set-cookie"]

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
      originalFilename: "log.txt",
      contentType: "text/html",
    })

    const res = await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .expect(200)

    expect(res.headers["content-type"]).toBe("application/octet-stream")
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="log.txt"; filename*=UTF-8''log.txt`,
    )
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["cache-control"]).toBe("private, max-age=300")
  })

  it("perfil desconhecido (removido/renomeado) não bloqueia mais o download — decisão é só pelo content_type", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-unknown-profile@example.com",
      name: "Legado",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-unknown-profile@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookies = loginRes.headers["set-cookie"]

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
      profile: "legacy-profile",
      originalFilename: "antigo.png",
    })

    const res = await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .expect(200)

    expect(res.headers["content-type"]).toBe("image/png")
    expect(res.headers["content-disposition"]).toBeUndefined()
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("perfil 'legacy' com content_type image/png segue inline (allowlist, não perfil)", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-legacy-inline@example.com",
      name: "Legacy",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-legacy-inline@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookies = loginRes.headers["set-cookie"]

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
      profile: "legacy",
    })

    const res = await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .expect(200)

    expect(res.headers["content-type"]).toBe("image/png")
    expect(res.headers["content-disposition"]).toBeUndefined()
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("mantém avatar inline", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-avatar-inline@example.com",
      name: "Avatar",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-avatar-inline@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookies = loginRes.headers["set-cookie"]

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "authenticated",
      profile: "avatar",
    })

    const res = await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .expect(200)

    expect(res.headers["content-type"]).toBe("image/png")
    expect(res.headers["content-disposition"]).toBeUndefined()
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["cache-control"]).toBe(
      "private, max-age=86400, immutable",
    )
  })

  /**
   * Regressão da parada de produção de 2026-08-15: o download abria transação e,
   * segurando a conexão dela, pedia uma SEGUNDA ao mesmo pool para a trilha de
   * acesso. Daí `DATABASE_POOL_MAX` downloads simultâneos travarem entre si —
   * e junto com eles a API inteira, porque não sobrava conexão para mais nada.
   * O número abaixo precisa passar do pool do `.env` para exercitar a exaustão.
   * 3x é a margem usada nas outras suítes de saturação deste incidente.
   */
  it("atende 3x DATABASE_POOL_MAX downloads simultâneos sem timeout de aquisição", async () => {
    // Anexo público e sem sessão de propósito: o que está sob teste é a
    // aquisição de conexão, e depender de login acoplaria o caso ao estado de
    // identity, que outras suítes do mesmo worker truncam.
    const id = await seedAttachment(pool, storage, {
      ownerUserId: "sem-dono",
      visibility: "public",
    })

    // Um listener só: `request(app.getHttpServer())` sobe uma porta efêmera por
    // chamada, e 16 binds concorrentes derrubam uns aos outros com ECONNRESET
    // antes de qualquer request chegar ao pool.
    const server = app.getHttpServer() as Server
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(0, resolve))
    }

    const simultaneos = 3 * loadEnv().DATABASE_POOL_MAX
    const responses = await Promise.all(
      Array.from({ length: simultaneos }, () =>
        request(server).get(`/v1/attachments/${id}`),
      ),
    )

    expect(responses.map((res) => res.status)).toEqual(
      Array<number>(simultaneos).fill(200),
    )
  })

  it("If-None-Match casando responde 304 sem abrir stream de storage", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-304@example.com",
      name: "Cache",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-304@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookies = loginRes.headers["set-cookie"]

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
    })

    const firstRes = await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .expect(200)
    const etag = firstRes.headers.etag as string
    const callsAfterFirst = getStreamCallCount()
    expect(callsAfterFirst).toBeGreaterThan(0)

    await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .set("If-None-Match", etag)
      .expect(304)

    expect(getStreamCallCount()).toBe(callsAfterFirst)
  })

  it("50 requisições If-None-Match contra storage com maxSockets:2 — a 51ª ainda responde", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-304-burst@example.com",
      name: "Burst",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-304-burst@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const cookies = loginRes.headers["set-cookie"]

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
    })
    const firstRes = await request(app.getHttpServer())
      .get(`/v1/attachments/${id}`)
      .set("Cookie", cookies!)
      .expect(200)
    const etag = firstRes.headers.etag as string

    const originalGetStream = storage.getStream
    storage.getStream = makeSocketLimitedStorage(storage, 2).getStream
    try {
      const responses = await Promise.all(
        Array.from({ length: 51 }, () =>
          request(app.getHttpServer())
            .get(`/v1/attachments/${id}`)
            .set("Cookie", cookies!)
            .set("If-None-Match", etag),
        ),
      )
      expect(responses.map((res) => res.status)).toEqual(Array<number>(51).fill(304))
    } finally {
      storage.getStream = originalGetStream
    }
  })

  it("abort do cliente no meio do corpo destrói o stream de origem", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-abort@example.com",
      name: "Abort",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "att-abort@example.com", password: "Senha-Att-Muito-Forte-2026!" })
      .expect(200)
    const setCookie: unknown = loginRes.headers["set-cookie"]
    const cookies = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie)

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
    })

    // Stream lento e controlável: dá tempo do teste abortar antes do fim do corpo.
    let slowStream: Readable | undefined
    const originalGetStream = storage.getStream
    storage.getStream = () => {
      slowStream = new Readable({
        read() {
          setTimeout(() => this.push(Buffer.alloc(1024, "x")), 20)
        },
      })
      return Promise.resolve(slowStream)
    }

    const server = app.getHttpServer() as Server
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(0, resolve))
    }
    const address = server.address()
    const port = typeof address === "object" && address !== null ? address.port : 0

    try {
      await new Promise<void>((resolve) => {
        const req = http.request(
          { host: "127.0.0.1", port, path: `/v1/attachments/${id}`, headers: { cookie: cookies } },
          (res) => {
            res.once("data", () => req.destroy())
          },
        )
        req.on("error", () => resolve())
        req.on("close", () => resolve())
        req.end()
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(slowStream?.destroyed).toBe(true)
    } finally {
      storage.getStream = originalGetStream
    }
  })
})

import http from "node:http"
import { Readable } from "node:stream"

import request from "supertest"
import { ulid } from "ulid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { loadEnv } from "../../../shared/config/env"
import { OBJECT_STORAGE } from "../../../shared/infra/storage/object-storage.port"
import { LoggerFactory } from "../../../shared/kernel/logging/logger.factory"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { resetDb } from "../../../shared/test/int/db"
import { seedUser } from "../../identity/testing"
import { inMemoryStorage, PNG_1PX } from "../testing"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"
import type { InMemoryStorage } from "../testing"
import type { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"

/**
 * Decora o `inMemoryStorage()` do barril contando chamadas de `getStream` —
 * o que prova que 304 nunca toca o storage.
 */
function withCallCount(base: InMemoryStorage): {
  storage: ObjectStoragePort
  getStreamCallCount: () => number
} {
  let callCount = 0
  const originalGetStream = base.getStream.bind(base)
  const storage: ObjectStoragePort = {
    ...base,
    getStream: (key) => {
      callCount += 1
      return originalGetStream(key)
    },
  }
  return { storage, getStreamCallCount: () => callCount }
}

/** Storage cujo `getStream` recusa passar de `maxSockets` chamadas simultâneas. */
function makeSocketLimitedStorage(
  base: ObjectStoragePort,
  maxSockets: number
): ObjectStoragePort {
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
  }
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
    [
      id,
      storageKey,
      contentType,
      PNG_1PX.byteLength,
      originalFilename,
      opts.ownerUserId,
      profile,
    ]
  )
  await pool.query(
    "insert into attachment.attachment_acls (attachment_id, visibility) values ($1, $2)",
    [id, opts.visibility]
  )
  return id
}

// SPEC_DEVIATION: extraído do it() por causa de vitest/no-conditional-in-test
// (regra nova do vitest lint set). Reason: idempotência de listen() fica fora
// do corpo do teste, sem mudar o comportamento (guard, não asserção).
async function ensureListening(server: Server): Promise<void> {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(0, resolve))
  }
}

describe("Attachment (e2e): download com ACL", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let storage: ObjectStoragePort
  let getStreamCallCount: () => number

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])
    ;({ storage, getStreamCallCount } = withCallCount(inMemoryStorage()))
    app = (await createE2eApp({ overrides: [[OBJECT_STORAGE, storage]] })).app
  })

  afterAll(async () => {
    await app.close()
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
      .send({
        email: "att-dl@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
      [attachmentId]
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
      .send({
        email: "att-owner@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
      .expect(200)
    const otherLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({
        email: "att-other@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
      .send({
        email: "att-force-dl@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
      `attachment; filename="log.txt"; filename*=UTF-8''log.txt`
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
      .send({
        email: "att-unknown-profile@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
      .send({
        email: "att-legacy-inline@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
      .send({
        email: "att-avatar-inline@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
      "private, max-age=86400, immutable"
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
    await ensureListening(server)

    const simultaneos = 3 * loadEnv().DATABASE_POOL_MAX
    const responses = await Promise.all(
      Array.from({ length: simultaneos }, () =>
        request(server).get(`/v1/attachments/${id}`)
      )
    )

    expect(responses.map((res) => res.status)).toEqual(
      Array<number>(simultaneos).fill(200)
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
      .send({
        email: "att-304@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
    const etag = firstRes.headers.etag!
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
      .send({
        email: "att-304-burst@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
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
    const etag = firstRes.headers.etag!

    const originalGetStream = storage.getStream.bind(storage)
    const limited = makeSocketLimitedStorage(storage, 2)
    storage.getStream = limited.getStream.bind(limited)
    try {
      const responses = await Promise.all(
        Array.from({ length: 51 }, () =>
          request(app.getHttpServer())
            .get(`/v1/attachments/${id}`)
            .set("Cookie", cookies!)
            .set("If-None-Match", etag)
        )
      )
      expect(responses.map((res) => res.status)).toEqual(
        Array<number>(51).fill(304)
      )
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
      .send({
        email: "att-abort@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
      .expect(200)
    const setCookie: unknown = loginRes.headers["set-cookie"]
    const cookies = Array.isArray(setCookie)
      ? setCookie.join("; ")
      : String(setCookie)

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
    })

    // Stream lento e controlável: dá tempo do teste abortar antes do fim do corpo.
    let slowStream: Readable | undefined
    const originalGetStream = storage.getStream.bind(storage)
    storage.getStream = () => {
      slowStream = new Readable({
        read() {
          setTimeout(() => this.push(Buffer.alloc(1024, "x")), 20)
        },
      })
      return Promise.resolve(slowStream)
    }

    const server = app.getHttpServer() as Server
    await ensureListening(server)
    const address = server.address()
    const port =
      typeof address === "object" && address !== null ? address.port : 0

    try {
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port,
            path: `/v1/attachments/${id}`,
            headers: { cookie: cookies },
          },
          (res) => {
            res.once("data", () => req.destroy())
          }
        )
        req.on("error", () => {
          resolve()
        })
        req.on("close", () => {
          resolve()
        })
        req.end()
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(slowStream?.destroyed).toBe(true)
    } finally {
      storage.getStream = originalGetStream
    }
  })
})

describe("Attachment (e2e): falha do storage depois dos headers (REM-12)", () => {
  const db = withE2ePool()
  let app: INestApplication
  let pool: Pool
  let storage: ObjectStoragePort
  let errorCalls: { msg: string; bindings: unknown }[]

  beforeAll(async () => {
    pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "attachment"])
    storage = inMemoryStorage()
    errorCalls = []
    const loggerFactory = {
      forModule: () => ({
        info: () => undefined,
        warn: () => undefined,
        error: (msg: string, bindings?: unknown) => {
          errorCalls.push({ msg, bindings })
        },
        debug: () => undefined,
      }),
    } as unknown as LoggerFactory

    app = (
      await createE2eApp({
        overrides: [
          [OBJECT_STORAGE, storage],
          [LoggerFactory, loggerFactory],
        ],
      })
    ).app
  })

  afterAll(async () => {
    await app.close()
  })

  it("stream de storage falha depois dos headers: conexão cai, log único, processo segue de pé", async () => {
    const userId = await seedUser(app, pool, {
      email: "att-dl-fail@example.com",
      name: "Fail",
      password: "Senha-Att-Muito-Forte-2026!",
    })
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({
        email: "att-dl-fail@example.com",
        password: "Senha-Att-Muito-Forte-2026!",
      })
      .expect(200)
    const setCookie: unknown = loginRes.headers["set-cookie"]
    const cookies = Array.isArray(setCookie)
      ? setCookie.join("; ")
      : String(setCookie)

    const id = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
    })

    // Primeiro chunk sai (headers vão junto), só depois o stream falha — é
    // exatamente o caso "erro pós-headers" que o catch do controller trata.
    let failingStream: Readable | undefined
    const originalGetStream = storage.getStream.bind(storage)
    let pushed = false
    storage.getStream = () => {
      failingStream = new Readable({
        read() {
          if (!pushed) {
            pushed = true
            // Menor que o Content-Length anunciado (tamanho real do PNG
            // semeado) — sem isso o servidor fecha por exceder o header, e o
            // teste provaria o limite errado.
            this.push(Buffer.alloc(20, "x"))
            return
          }
          setTimeout(
            () => this.destroy(new Error("falha simulada pós-headers")),
            10
          )
        },
      })
      return Promise.resolve(failingStream)
    }

    const server = app.getHttpServer() as Server
    await ensureListening(server)
    const address = server.address()
    const port =
      typeof address === "object" && address !== null ? address.port : 0

    try {
      const received = await new Promise<{
        bytes: number
        endedWithoutError: boolean
      }>((resolve) => {
        let bytes = 0
        // agent:false — o servidor derruba a conexão pós-headers; sem isso o
        // socket morto pode voltar pro pool do agent global e confundir uma
        // requisição de outro teste que reúse a porta depois do app.close().
        const req = http.request(
          {
            host: "127.0.0.1",
            port,
            path: `/v1/attachments/${id}`,
            headers: { cookie: cookies },
            agent: false,
          },
          (res) => {
            res.on("data", (chunk: Buffer) => {
              bytes += chunk.length
            })
            res.on("end", () => {
              resolve({ bytes, endedWithoutError: true })
            })
            res.on("close", () => {
              resolve({ bytes, endedWithoutError: false })
            })
          }
        )
        req.on("error", () => {
          resolve({ bytes, endedWithoutError: false })
        })
        req.end()
      })

      // Content-Length anunciado é o tamanho inteiro do PNG semeado — corpo
      // incompleto (e sem "end" limpo) prova que a conexão foi derrubada.
      expect(received.bytes).toBeLessThan(PNG_1PX.byteLength)
      expect(received.endedWithoutError).toBe(false)

      // O fechamento chega ao cliente antes do catch do controller terminar
      // do lado do servidor — dá um instante pro teardown assíncrono rodar
      // antes de checar o stream/log (mesma folga do teste de abort acima).
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(failingStream?.destroyed).toBe(true)
      // A conexão derrubada também deixa a trilha de acesso falhar ao
      // registrar (log próprio, não relacionado) — filtra pela chave do
      // teardown do download em vez de exigir que seja o único log de erro.
      const downloadFailedLogs = errorCalls.filter(
        (call) => call.msg === "attachment.download_stream_failed"
      )
      expect(downloadFailedLogs).toHaveLength(1)
    } finally {
      storage.getStream = originalGetStream
    }

    const secondId = await seedAttachment(pool, storage, {
      ownerUserId: userId,
      visibility: "restricted",
      originalFilename: "ok.png",
    })
    await request(app.getHttpServer())
      .get(`/v1/attachments/${secondId}`)
      .set("Cookie", cookies)
      .expect(200)
  })
})

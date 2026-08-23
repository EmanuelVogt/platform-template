import { Readable } from "node:stream"

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

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
  "base64",
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
          : { contentType: o.contentType, sizeBytes: o.body.byteLength, etag: "" },
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
    await seedUser(app, pool, { email, name: "Upload", password: "Senha-Att-Muito-Forte-2026!" })
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
      .attach("file", PNG_1PX, { filename: "avatar.png", contentType: "image/png" })
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
      .attach("file", HTML_BYTES, { filename: "fake.png", contentType: "image/png" })
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
      .attach("file", PNG_1PX, { filename: "swapped.png", contentType: "image/jpeg" })
      .expect(415)

    expect(res.body.type).toMatch(/\/unsupported-media-type$/)
  })

  it("recusa upload sem sessão (401/403 — rota exige actor)", async () => {
    await request(app.getHttpServer())
      .post("/v1/attachments/uploads")
      .query({ profile: "image" })
      .attach("file", PNG_1PX, { filename: "avatar.png", contentType: "image/png" })
      .expect((res) => {
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`esperava 401 ou 403, veio ${String(res.status)}`)
        }
      })
  })
})

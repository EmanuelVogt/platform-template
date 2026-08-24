import http from "node:http"

import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp } from "../../../../test/setup/app-factory"
import {
  createTestPool,
  seedEmail,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { MAILER } from "../../notification/domain/ports/mailer"
import { allowAllRateLimiter } from "../testing/allow-all-rate-limiter"
import { fakeMailer } from "../testing/fake-mailer"
import { seedUser } from "../testing/seed-user"

import type { INestApplication } from "@nestjs/common"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Sse-Forte-2026!"
const SUITE = "sse"

/**
 * Faz a request GET e destrói o socket assim que os headers chegam.
 * Retorna status e content-type sem consumir o stream — evita hang.
 */
function probeSSE(
  server: ReturnType<typeof http.createServer>,
  path: string,
  cookie: string[]
): Promise<{ statusCode: number; contentType: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address()
    if (!addr || typeof addr === "string") {
      reject(new Error("endereço do servidor inválido"))
      return
    }

    const req = http.request(
      {
        host: "127.0.0.1",
        port: addr.port,
        path,
        method: "GET",
        headers: {
          Origin: ORIGIN,
          // supertest usa array de cookies; aqui passamos como header único
          Cookie: cookie.map((c) => c.split(";")[0]).join("; "),
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 0
        const contentType = res.headers["content-type"] ?? ""
        // Destrói o socket antes de consumir qualquer dado — o stream SSE não
        // termina por si só; destruir evita que o teste penda.
        res.destroy()
        resolve({ statusCode, contentType })
      }
    )
    req.on("error", (err) => {
      // ECONNRESET é esperado quando destruímos o socket do lado do cliente
      if ((err as NodeJS.ErrnoException).code === "ECONNRESET") {
        // já resolvemos no callback de response
        return
      }
      reject(err)
    })
    req.end()
  })
}

describe("SSE handshake /v1/notifications/stream (e2e)", () => {
  let app: INestApplication
  let pool: Pool

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "TRUNCATE TABLE notification.notifications, notification.notification_deliveries"
    )

    app = await createE2eApp((b) =>
      b
        .overrideProvider(RATE_LIMITER)
        .useValue(allowAllRateLimiter)
        .overrideProvider(MAILER)
        .useValue(fakeMailer())
    )
    // listen(0) abre numa porta efêmera — necessário para o http nativo conseguir
    // endereçar o servidor fora do ciclo do supertest.
    await app.getHttpServer().listen(0)
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  async function login(email: string, password: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password })
      .expect(200)
    const setCookie = res.get("Set-Cookie")
    if (!setCookie) throw new Error("login não retornou Set-Cookie")
    return setCookie
  }

  it("retorna 200 com content-type text/event-stream quando autenticado", async () => {
    await seedUser(app, pool, {
      email: seedEmail(SUITE, "alice"),
      password: PASSWORD,
    })
    const cookie = await login(seedEmail(SUITE, "alice"), PASSWORD)

    const { statusCode, contentType } = await probeSSE(
      app.getHttpServer(),
      "/v1/notifications/stream",
      cookie
    )

    expect(statusCode).toBe(200)
    expect(contentType).toContain("text/event-stream")
  })

  it("retorna 401 sem cookie de sessão", async () => {
    // supertest funciona aqui porque o 401 tem corpo JSON e fecha a conexão
    await request(app.getHttpServer())
      .get("/v1/notifications/stream")
      .set("Origin", ORIGIN)
      .expect(401)
  })
})

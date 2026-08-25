import http from "node:http"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import {
  emails,
  fakeMailer,
  loginAs,
  seedUser,
  TEST_PASSWORD,
} from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const mail = emails("sse")

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
          Origin: E2E_ORIGIN,
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
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    e2e = await createE2eApp({ overrides: [[MAILER, fakeMailer()]] })
    // listen(0) abre numa porta efêmera — necessário para o http nativo conseguir
    // endereçar o servidor fora do ciclo do supertest.
    await e2e.app.getHttpServer().listen(0)
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("retorna 200 com content-type text/event-stream quando autenticado", async () => {
    const email = mail("alice")
    await seedUser(e2e.app, db.pool, { email, password: TEST_PASSWORD })
    const cookies = await loginAs(e2e.http, email)

    const { statusCode, contentType } = await probeSSE(
      e2e.app.getHttpServer(),
      "/v1/notifications/stream",
      cookies
    )

    expect(statusCode).toBe(200)
    expect(contentType).toContain("text/event-stream")
  })

  it("retorna 401 sem cookie de sessão", async () => {
    // supertest funciona aqui porque o 401 tem corpo JSON e fecha a conexão
    await e2e.http
      .get("/v1/notifications/stream")
      .set("Origin", E2E_ORIGIN)
      .expect(401)
  })
})

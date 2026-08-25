import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp } from "../src/shared/test/e2e/app"

import type { E2eApp } from "../src/shared/test/e2e/app"
import type { Express } from "express"

describe("Security bootstrap (e2e)", () => {
  let e2e: E2eApp

  beforeAll(async () => {
    e2e = await createE2eApp({
      // Registrada antes do app.init(): o router do Nest, montado no init,
      // responde 404 pra qualquer path que ele não conheça — uma rota crua
      // adicionada depois nunca seria alcançada.
      beforeInit: (app) => {
        const server = app.getHttpAdapter().getInstance() as Express
        server.get("/__trust-proxy-probe", (req, res) => {
          res.json({ ip: req.ip })
        })
      },
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("envia headers do helmet", async () => {
    const res = await e2e.http.get("/health")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("ecoa Access-Control-Allow-Origin só para a origin permitida", async () => {
    const ok = await e2e.http
      .get("/health")
      .set("Origin", "http://localhost:5173")
    expect(ok.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    )
    expect(ok.headers["access-control-allow-credentials"]).toBe("true")

    const bad = await e2e.http
      .get("/health")
      .set("Origin", "http://evil.example")
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("com TRUST_PROXY_HOPS não definido, req.ip é o endereço do socket e ignora X-Forwarded-For", async () => {
    const res = await e2e.http
      .get("/__trust-proxy-probe")
      .set("X-Forwarded-For", "203.0.113.7")

    expect(res.body.ip).not.toBe("203.0.113.7")
    expect(res.body.ip).toMatch(/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/)
  })
})

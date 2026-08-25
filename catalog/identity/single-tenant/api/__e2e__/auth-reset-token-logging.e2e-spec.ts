import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { resetDb } from "../../../shared/test/int/db"

import type { E2eApp } from "../../../shared/test/e2e/app"

describe("Reset — token nunca em corpo/instance/log (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp
  const logged: string[] = []
  let originalWrite: typeof process.stdout.write

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])

    // captura stdout (pino) para inspecionar vazamento de token
    originalWrite = process.stdout.write.bind(process.stdout)
    ;(process.stdout.write as unknown) = (
      chunk: string | Uint8Array
    ): boolean => {
      logged.push(chunk.toString())
      return true
    }

    e2e = await createE2eApp({ rateLimiter: "real" })
  })

  afterAll(async () => {
    ;(process.stdout.write as unknown) = originalWrite
    await e2e.close()
  })

  it("reset com token no body → token bruto não aparece no corpo, instance nem log", async () => {
    const FAKE_TOKEN = "token-secreto-de-reset-que-nao-pode-vazar-123456789"

    const res = await e2e.http
      .post("/v1/auth/reset-password")
      .set("Origin", E2E_ORIGIN)
      .set("Idempotency-Key", "reset-fake")
      .send({ token: FAKE_TOKEN, password: "Senha-Nova-Muito-Forte-2026!" })

    // token inválido → erro de cliente (4xx); o corpo não pode ecoar o token
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(JSON.stringify(res.body)).not.toContain(FAKE_TOKEN)
    // SPEC_DEVIATION: checagem incondicional (?? "") no lugar de `if`.
    // Reason: vitest/no-conditional-expect — `instance` é opcional no corpo
    // RFC7807; sem ele, comparar contra "" é sempre verdadeiro e preserva o
    // "só checa se existir" original sem `expect` dentro de `if`.
    expect(res.body.instance ?? "").not.toContain(FAKE_TOKEN)

    const allLogs = logged.join("")
    expect(allLogs).not.toContain(FAKE_TOKEN)
  })
})

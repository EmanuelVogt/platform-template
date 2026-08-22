import { client, configureClient } from "@platform/api-client/client"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "@/shared/test/msw-server"

const BASE_URL = "http://localhost:3000"
// Rota sintética: o template não publica mutação nenhuma no contrato, e o
// comportamento sob teste é do transporte, não de uma operação.
const MUTATION_URL = "/v1/exemplo"

// onUnauthorized é instalado uma vez no configureClient; delega para este spy,
// reatribuído por teste, para o interceptor de 401 não empilhar.
const onUnauthorized = vi.fn()

function post(data?: unknown) {
  return client({ method: "POST", url: MUTATION_URL, data })
}

describe("transporte do api-client (integração via MSW)", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" })
    configureClient({
      baseURL: BASE_URL,
      onUnauthorized: (ctx) => onUnauthorized(ctx),
    })
  })

  beforeEach(() => {
    onUnauthorized.mockReset()
    document.cookie = "rit_csrf=tok-123"
  })

  afterEach(() => {
    server.resetHandlers()
    document.cookie = "rit_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
  })

  afterAll(() => {
    server.close()
  })

  it("reflete o cookie rit_csrf em X-CSRF-Token nas mutações com corpo", async () => {
    let received: string | null = null
    server.use(
      http.post(`${BASE_URL}${MUTATION_URL}`, ({ request }) => {
        received = request.headers.get("x-csrf-token")
        return HttpResponse.json({ ok: true })
      }),
    )

    await post({ campo: "valor" })

    expect(received).toBe("tok-123")
  })

  it("envia X-CSRF-Token mesmo em mutação sem corpo (ADR 0023)", async () => {
    let received: string | null = null
    server.use(
      http.post(`${BASE_URL}${MUTATION_URL}`, ({ request }) => {
        received = request.headers.get("x-csrf-token")
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(post()).resolves.toMatchObject({ status: 204 })
    expect(received).toBe("tok-123")
  })

  it("dispara onUnauthorized no 401 com a url da request", async () => {
    server.use(
      http.post(`${BASE_URL}${MUTATION_URL}`, () =>
        HttpResponse.json({ type: "about:blank", status: 401 }, { status: 401 }),
      ),
    )

    await expect(post({ campo: "valor" })).rejects.toBeDefined()

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({ url: MUTATION_URL }),
    )
  })

  it("propaga o corpo problem+json (RFC 7807) no erro do axios", async () => {
    const problem = {
      type: "https://errors.example.com/invalid-input",
      title: "Entrada inválida",
      status: 400,
      detail: "Campo obrigatório ausente.",
    }
    server.use(
      http.post(`${BASE_URL}${MUTATION_URL}`, () =>
        HttpResponse.json(problem, { status: 400 }),
      ),
    )

    await expect(post({ campo: "valor" })).rejects.toMatchObject({
      response: { status: 400, data: problem },
    })
    // Não é 401 → onUnauthorized não dispara.
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

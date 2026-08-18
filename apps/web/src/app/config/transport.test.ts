import { configureClient } from "@platform/api-client/client"
import { login } from "@platform/api-client/hooks/useLogin"
import { logout } from "@platform/api-client/hooks/useLogout"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "@/shared/test/msw-server"

const BASE_URL = "http://localhost:3000"

// onUnauthorized é instalado uma vez no configureClient; delega para este spy,
// reatribuído por teste, para o interceptor de 401 não empilhar.
const onUnauthorized = vi.fn()

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

describe("transporte do api-client (integração via MSW)", () => {
  it("reflete o cookie rit_csrf em X-CSRF-Token nas mutações com corpo", async () => {
    let received: string | null = null
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, ({ request }) => {
        received = request.headers.get("x-csrf-token")
        return HttpResponse.json({ id: "u1", email: "a@b.com" })
      }),
    )

    await login({ email: "a@b.com", password: "secret-123" })

    expect(received).toBe("tok-123")
  })

  it("envia X-CSRF-Token mesmo em mutação sem corpo (logout — ADR 0023)", async () => {
    let received: string | null = null
    server.use(
      http.post(`${BASE_URL}/v1/auth/logout`, ({ request }) => {
        received = request.headers.get("x-csrf-token")
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(logout()).resolves.not.toThrow()
    expect(received).toBe("tok-123")
  })

  it("dispara onUnauthorized no 401 com a url da request", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () =>
        HttpResponse.json({ type: "about:blank", status: 401 }, { status: 401 }),
      ),
    )

    await expect(
      login({ email: "a@b.com", password: "wrong" }),
    ).rejects.toBeDefined()

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/v1/auth/login" }),
    )
  })

  it("propaga o corpo problem+json (RFC 7807) no erro do axios", async () => {
    const problem = {
      type: "https://rituaali/errors/invalid-credentials",
      title: "Credenciais inválidas",
      status: 400,
      detail: "E-mail ou senha incorretos.",
    }
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () =>
        HttpResponse.json(problem, { status: 400 }),
      ),
    )

    await expect(
      login({ email: "a@b.com", password: "wrong" }),
    ).rejects.toMatchObject({
      response: { status: 400, data: problem },
    })
    // Não é 401 → onUnauthorized não dispara.
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

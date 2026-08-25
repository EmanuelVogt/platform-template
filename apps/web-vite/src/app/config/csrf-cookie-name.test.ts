import { client, configureClient } from "@platform/api-client/client"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { server } from "@/shared/test/msw-server"

const BASE_URL = "http://localhost:3000"
// Rota sintética: o template não publica mutação nenhuma no contrato, e o
// comportamento sob teste é do transporte, não de uma operação.
const MUTATION_URL = "/v1/exemplo"

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}`
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

async function csrfHeaderOfMutation(): Promise<string | null> {
  let received: string | null = null
  server.use(
    http.post(`${BASE_URL}${MUTATION_URL}`, ({ request }) => {
      received = request.headers.get("x-csrf-token")
      return HttpResponse.json({ ok: true })
    })
  )

  await client({ method: "POST", url: MUTATION_URL, data: { campo: "valor" } })

  return received
}

describe("configureClient — nome do cookie de CSRF (BRAND-02)", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" })
  })

  afterEach(() => {
    server.resetHandlers()
    clearCookie("app_csrf")
    clearCookie("produto_csrf")
  })

  afterAll(() => {
    server.close()
  })

  it("usa app_csrf quando a opção não é passada", async () => {
    configureClient({ baseURL: BASE_URL })
    setCookie("app_csrf", "tok-default")

    await expect(csrfHeaderOfMutation()).resolves.toBe("tok-default")
  })

  it("lê o cookie que o produto nomeou em csrfCookieName", async () => {
    configureClient({ baseURL: BASE_URL, csrfCookieName: "produto_csrf" })
    setCookie("produto_csrf", "tok-produto")

    await expect(csrfHeaderOfMutation()).resolves.toBe("tok-produto")
  })

  it("omite o header quando o cookie nomeado não existe", async () => {
    configureClient({ baseURL: BASE_URL, csrfCookieName: "produto_csrf" })
    setCookie("app_csrf", "tok-default")

    await expect(csrfHeaderOfMutation()).resolves.toBeNull()
  })

  it("volta ao default quando um boot seguinte não passa a opção", async () => {
    configureClient({ baseURL: BASE_URL, csrfCookieName: "produto_csrf" })
    configureClient({ baseURL: BASE_URL })
    setCookie("app_csrf", "tok-default")
    setCookie("produto_csrf", "tok-produto")

    await expect(csrfHeaderOfMutation()).resolves.toBe("tok-default")
  })
})

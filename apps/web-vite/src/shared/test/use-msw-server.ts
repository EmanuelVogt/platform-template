import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "./msw-server"

import type { RequestHandler } from "msw"

/**
 * Liga o server MSW compartilhado ao ciclo de vida do Vitest: listen no
 * beforeAll, reset para os handlers informados a cada teste, close no
 * afterAll — substitui o boilerplate manual de listen/resetHandlers/close.
 */
export function useMswServer(...handlers: RequestHandler[]): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" })
  })

  afterEach(() => {
    server.resetHandlers(...handlers)
  })

  afterAll(() => {
    server.close()
  })
}

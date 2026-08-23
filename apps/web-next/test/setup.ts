import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import "@testing-library/jest-dom/vitest"
import "@/_app/config/zod-locale"

// SPEC_DEVIATION: design § 2 menciona "msw server lifecycle" aqui, mas o setup.ts
// real do Vite shell não registra listen/resetHandlers/close globalmente — cada
// teste que usa `server` (msw-server.ts) faz isso no próprio arquivo
// (ver apps/web-vite/src/app/config/transport.test.ts). Mantido igual ao Vite.
// Reason: "mirror of Vite test/setup" (design § 2) é mais específico que a
// menção solta a "msw server lifecycle" e reflete o comportamento real copiado.
afterEach(() => {
  cleanup()
})

import { existsSync } from "node:fs"

import { defineConfig } from "vitest/config"

// O shell web renderizado mora em `apps/web`; neste repositório do template os
// dois shells convivem como `apps/web-vite`/`apps/web-next` e ambos declaram o
// projeto `web`, então o run raiz roda o shell padrão (Vite). O `web-next` tem
// run próprio (`.github/workflows/catalog.yml`, job `smoke`).
const WEB_PROJECT = [
  "apps/web/vitest.config.ts",
  "apps/web-vite/vitest.config.ts",
].find((file) => existsSync(file))

/**
 * `pnpm test`: só os tiers unitários. Sem `globalSetup` e sem `coverage` de
 * propósito — é o loop interno, roda sem Docker.
 */
export default defineConfig({
  test: {
    projects: [
      "apps/api/vitest.config.mts",
      ...(WEB_PROJECT ? [WEB_PROJECT] : []),
    ],
  },
})

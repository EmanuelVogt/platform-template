import { defineConfig } from "vitest/config"

/**
 * `pnpm test`: só os tiers unitários. Sem `globalSetup` e sem `coverage` de
 * propósito — é o loop interno, roda sem Docker.
 */
export default defineConfig({
  test: {
    projects: ["apps/api/vitest.config.mts", "apps/web/vitest.config.ts"],
  },
})

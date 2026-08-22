import { defineConfig } from "vitest/config"

/**
 * Tiers de banco: um Postgres e um Redis por run, subidos pelo `globalSetup`,
 * com as URIs chegando aos workers por `provide`/`inject`.
 */
export default defineConfig({
  test: {
    projects: [
      "apps/api/vitest.int.config.mts",
      "apps/api/vitest.e2e.config.mts",
    ],
    globalSetup: ["apps/api/test/setup/global-setup.ts"],
  },
})

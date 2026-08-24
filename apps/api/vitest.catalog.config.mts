import { defineConfig } from "vitest/config"

import { apiDefaults, swcPlugin } from "./vitest.shared.mjs"

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    ...apiDefaults,
    name: "catalog",
    // Só o kernel staged por `catalog-stage.mjs`; `*.int-spec.ts` e
    // `*.e2e-spec.ts` terminam em `-spec.ts`, não em `.spec.ts` — os tiers
    // de banco ficam de fora sem precisar de exclude (mesmo truque do
    // `apps/api/vitest.config.mts`).
    include: [".catalog-stage/src/modules/**/*.spec.ts"],
    setupFiles: ["./test/setup/unit-env.ts"],
    maxWorkers: 4,
  },
})

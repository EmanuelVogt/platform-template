import { defineConfig } from "vitest/config"

import { API_MAX_WORKERS, apiDefaults, swcPlugin } from "./vitest.shared.mjs"

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
    maxWorkers: API_MAX_WORKERS,
    // Mesmo `maxWorkers` do tier unitário (API_MAX_WORKERS): precisa do
    // mesmo `groupOrder` para não colidir com o `web` (grupo 0, default) —
    // só ocorre quando este projeto entra num run mesclado como o de
    // `pnpm test:coverage`; `pnpm catalog:test` roda sozinho e não vê isto.
    sequence: { groupOrder: 1 },
  },
})

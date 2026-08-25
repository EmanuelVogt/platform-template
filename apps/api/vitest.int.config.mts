import { defineConfig } from "vitest/config"

import { API_MAX_WORKERS, dbTierDefaults, swcPlugin } from "./vitest.shared.mjs"

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    ...dbTierDefaults,
    name: "api-int",
    // `test/**` entra porque o proof spec do handshake de worker DB mora junto
    // do harness que ele assevera (`test/setup/test-db.int-spec.ts`).
    include: ["src/**/*.int-spec.ts", "test/**/*.int-spec.ts"],
    setupFiles: ["./test/setup/int-env.ts"],
    // O harness reivindica um `test_wN` por processo em vez de derivá-lo de
    // `VITEST_POOL_ID`, que o runner repete entre workers vivos; este é o
    // teto de clones que ele pode reivindicar.
    env: { TEST_DB_WORKERS: String(API_MAX_WORKERS) },
    maxWorkers: API_MAX_WORKERS,
    // Mesmo grupo do tier unitário (mesmo `maxWorkers`); o e2e, serial, vem
    // depois — ver `vitest.e2e.config.mts`.
    sequence: { groupOrder: 1 },
  },
})

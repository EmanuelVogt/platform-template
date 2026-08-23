import { defineConfig } from "vitest/config"

import { dbTierDefaults, swcPlugin } from "./vitest.shared.mjs"

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    ...dbTierDefaults,
    name: "api-int",
    // `test/**` entra porque o proof spec do handshake de worker DB mora junto
    // do harness que ele assevera (`test/setup/test-db.int-spec.ts`).
    include: ["src/**/*.int-spec.ts", "test/**/*.int-spec.ts"],
    setupFiles: ["./test/setup/int-env.ts"],
    maxWorkers: 4,
    // Mesmo grupo do tier unitário (mesmo `maxWorkers`); o e2e, serial, vem
    // depois — ver `vitest.e2e.config.mts`.
    sequence: { groupOrder: 1 },
  },
})

import { defineConfig } from "vitest/config"

/**
 * `pnpm test:coverage`: os quatro projetos num processo só, cobertura v8
 * mesclada e piso por glob. É o gate honesto — o único run em que a linha de
 * um arquivo coberto apenas pelo e2e conta junto com a do unitário.
 */
export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.ts",
      "apps/api/vitest.config.mts",
      "apps/api/vitest.int.config.mts",
      "apps/api/vitest.e2e.config.mts",
    ],
    globalSetup: ["apps/api/test/setup/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      // `include` explícito é o que faz arquivo sem teste entrar na conta: o
      // `coverage.all` do Vitest 3 não existe mais.
      include: ["apps/api/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.spec.ts",
        "**/*.int-spec.ts",
        "**/*.e2e-spec.ts",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/*.fixture.ts",
        "apps/api/src/main.ts",
        "apps/api/src/db/**",
        "apps/web/src/main.tsx",
        "**/shared/test/**",
        "apps/api/test/**",
      ],
      // Ratchet por glob, sem barra global: não baixar para passar no gate —
      // subir só com teste novo.
      thresholds: {
        // "apps/api/src/**": calibrated once at the migration (AD-027)
        "apps/web/src/**": {
          statements: 64,
          branches: 56,
          functions: 61,
          lines: 64,
        },
      },
    },
  },
})
